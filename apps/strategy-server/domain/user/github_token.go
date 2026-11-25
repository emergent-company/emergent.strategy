package user

// A user's GitHub OAuth token can read and write their private repositories, so
// users.github_access_token holds it sealed (internal/seal). This file is the only
// reader and writer of that column; domain.User deliberately has no field for it.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/seal"
)

// ErrTokenUnreadable means a token is stored but cannot be used: its key is not
// configured, it belongs to another row, it was altered, or it is plain text
// where plain text is refused. Connecting GitHub again replaces it.
var ErrTokenUnreadable = errors.New("stored github token cannot be read")

// WithTokenKeys seals stored GitHub tokens with keys. refusePlaintext stops
// values stored before encryption from being read. A nil keyring leaves tokens
// unsealed.
func (s *Service) WithTokenKeys(keys *seal.Keyring, refusePlaintext bool) *Service {
	s.tokenKeys = keys
	s.refusePlaintext = refusePlaintext
	return s
}

// tokenAAD binds a sealed token to its column and user.
func tokenAAD(userID uuid.UUID) []byte {
	return []byte("users.github_access_token:" + userID.String())
}

// StoreGithubToken persists the user's GitHub OAuth access token.
// Called after a successful OAuth callback.
func (s *Service) StoreGithubToken(ctx context.Context, userID uuid.UUID, token string) error {
	value := token
	if s.tokenKeys != nil {
		sealed, err := s.tokenKeys.Seal(token, tokenAAD(userID))
		if err != nil {
			return fmt.Errorf("seal github token: %w", err)
		}
		value = sealed
	}
	_, err := s.db.NewUpdate().
		TableExpr("users").
		Set("github_access_token = ?", value).
		Set("updated_at = NOW()").
		Where("id = ?", userID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("store github token: %w", err)
	}
	return nil
}

// ClearGithubToken removes the stored GitHub OAuth token for a user.
// Called when the token is known to be revoked or invalid.
func (s *Service) ClearGithubToken(ctx context.Context, userID uuid.UUID) error {
	_, err := s.db.NewUpdate().
		TableExpr("users").
		Set("github_access_token = NULL").
		Set("updated_at = NOW()").
		Where("id = ?", userID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("clear github token: %w", err)
	}
	return nil
}

// GetGithubToken returns the stored GitHub OAuth token for a user.
// Returns ("", nil) when no token is stored, and ErrTokenUnreadable when one is
// stored that cannot be used. A value that is not sealed with the first key is
// re-sealed on the way.
func (s *Service) GetGithubToken(ctx context.Context, userID uuid.UUID) (string, error) {
	var row struct {
		Token *string `bun:"github_access_token"`
	}
	err := s.db.NewSelect().
		TableExpr("users").
		ColumnExpr("github_access_token").
		Where("id = ?", userID).
		Scan(ctx, &row)
	if err != nil {
		return "", fmt.Errorf("get github token: %w", err)
	}
	if row.Token == nil || *row.Token == "" {
		return "", nil
	}

	token, err := s.openToken(userID, *row.Token)
	if err != nil {
		return "", err
	}
	if s.tokenKeys != nil && !s.tokenKeys.SealedWithPrimary(*row.Token) {
		// The token is good; failing to re-seal it must not fail the caller. The
		// next read or start-up tries again.
		if resealErr := s.reseal(ctx, userID, *row.Token, token); resealErr != nil {
			slog.WarnContext(ctx, "re-seal github token", "user_id", userID, "err", resealErr)
		}
	}
	return token, nil
}

// openToken turns a stored value into the token.
func (s *Service) openToken(userID uuid.UUID, value string) (string, error) {
	if !seal.IsSealed(value) {
		if s.refusePlaintext {
			return "", fmt.Errorf("%w: it is not encrypted", ErrTokenUnreadable)
		}
		return value, nil
	}
	if s.tokenKeys == nil {
		return "", fmt.Errorf("%w: it is encrypted and no key is configured", ErrTokenUnreadable)
	}
	token, err := s.tokenKeys.Open(value, tokenAAD(userID))
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrTokenUnreadable, err)
	}
	return token, nil
}

// reseal replaces the stored value old with token sealed under the first key. The
// update applies only while old is still stored, so it cannot undo a token stored
// or cleared in the meantime.
func (s *Service) reseal(ctx context.Context, userID uuid.UUID, old, token string) error {
	sealed, err := s.tokenKeys.Seal(token, tokenAAD(userID))
	if err != nil {
		return fmt.Errorf("seal github token: %w", err)
	}
	_, err = s.db.NewUpdate().
		TableExpr("users").
		Set("github_access_token = ?", sealed).
		Where("id = ?", userID).
		Where("github_access_token = ?", old).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("replace github token: %w", err)
	}
	return nil
}

// SealReport counts what SealStoredTokens did.
type SealReport struct {
	// Sealed values were plain text.
	Sealed int
	// Resealed values were sealed with an older key.
	Resealed int
	// Unreadable values were left as they are.
	Unreadable int
}

// SealStoredTokens seals every stored token with the first key: plain text values
// and values sealed with an older key. It runs at start-up, changes nothing that
// is already current, and can be run again after an interrupted run. A value it
// cannot open is logged by user and left alone. Without a key it does nothing.
func (s *Service) SealStoredTokens(ctx context.Context) (SealReport, error) {
	var report SealReport
	if s.tokenKeys == nil {
		return report, nil
	}
	var rows []struct {
		ID    uuid.UUID `bun:"id"`
		Token string    `bun:"github_access_token"`
	}
	// Deleted users are included: their tokens are stored like anyone's.
	err := s.db.NewSelect().
		TableExpr("users").
		ColumnExpr("id, github_access_token").
		Where("github_access_token <> ''").
		Scan(ctx, &rows)
	if err != nil {
		return report, fmt.Errorf("list stored github tokens: %w", err)
	}

	for _, row := range rows {
		if s.tokenKeys.SealedWithPrimary(row.Token) {
			continue
		}
		wasSealed := seal.IsSealed(row.Token)
		token := row.Token
		if wasSealed {
			// Plain text is sealed here even where reading it is refused.
			if token, err = s.openToken(row.ID, row.Token); err != nil {
				report.Unreadable++
				slog.WarnContext(ctx, "stored github token left as it is", "user_id", row.ID, "err", err)
				continue
			}
		}
		if err := s.reseal(ctx, row.ID, row.Token, token); err != nil {
			return report, fmt.Errorf("user %s: %w", row.ID, err)
		}
		if wasSealed {
			report.Resealed++
		} else {
			report.Sealed++
		}
	}
	return report, nil
}
