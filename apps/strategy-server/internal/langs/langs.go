// Package langs provides i18n support for strategy-server.
//
// Usage in handlers:
//
//	msg := langs.T(ctx, "workspace.not_found")
//
// Usage in templates:
//
//	{langs.T(ctx, "workspace.create")}
package langs

import (
	"context"
	"fmt"
	"math"
	"time"

	"golang.org/x/text/language"
)

type contextKey struct{}

// Locale represents a supported language locale.
type Locale string

const (
	LocaleEN Locale = "en"
	LocaleNB Locale = "nb"
)

// messages holds all translation strings keyed by locale and message key.
// Extend this map as new UI copy is added. Never hard-code user-facing strings outside this file.
var messages = map[Locale]map[string]string{
	LocaleEN: {
		// Generic
		"error.not_found":    "Not found",
		"error.bad_request":  "Bad request",
		"error.forbidden":    "Forbidden",
		"error.unauthorized": "Unauthorized",
		"error.internal":     "An unexpected error occurred",
		"error.conflict":     "Conflict",
		"action.save":        "Save",
		"action.cancel":      "Cancel",
		"action.delete":      "Delete",
		"action.edit":        "Edit",
		"action.create":      "Create",
		"action.archive":     "Archive",
		"action.commit":      "Commit changes",
		"action.discard":     "Discard changes",
		// Workspace
		"workspace.title":     "Workspaces",
		"workspace.create":    "Create workspace",
		"workspace.not_found": "Workspace not found",
		"workspace.conflict":  "A workspace with this GitHub owner already exists",
		// Instance
		"instance.title":     "Strategy instances",
		"instance.create":    "Import instance",
		"instance.not_found": "Strategy instance not found",
		"instance.archived":  "This instance has been archived",
		// Authoring
		"authoring.staged":    "Changes staged. Review and commit when ready.",
		"authoring.committed": "Changes committed successfully.",
		"authoring.discarded": "Staged changes discarded.",
		// Health
		"health.ok": "OK",
	},
	LocaleNB: {
		// Generic
		"error.not_found":    "Ikke funnet",
		"error.bad_request":  "Ugyldig forespørsel",
		"error.forbidden":    "Forbudt",
		"error.unauthorized": "Ikke autorisert",
		"error.internal":     "En uventet feil oppstod",
		"error.conflict":     "Konflikt",
		"action.save":        "Lagre",
		"action.cancel":      "Avbryt",
		"action.delete":      "Slett",
		"action.edit":        "Rediger",
		"action.create":      "Opprett",
		"action.archive":     "Arkiver",
		"action.commit":      "Bekreft endringer",
		"action.discard":     "Forkast endringer",
		// Workspace
		"workspace.title":     "Arbeidsområder",
		"workspace.create":    "Opprett arbeidsområde",
		"workspace.not_found": "Arbeidsområde ikke funnet",
		"workspace.conflict":  "Et arbeidsområde med denne GitHub-eieren finnes allerede",
		// Instance
		"instance.title":     "Strategiinstanser",
		"instance.create":    "Importer instans",
		"instance.not_found": "Strategiinstans ikke funnet",
		"instance.archived":  "Denne instansen er arkivert",
		// Authoring
		"authoring.staged":    "Endringer klargjort. Gjennomgå og bekreft når du er klar.",
		"authoring.committed": "Endringer bekreftet.",
		"authoring.discarded": "Klargjorte endringer forkastet.",
		// Health
		"health.ok": "OK",
	},
}

// WithLocale returns a context that carries the given locale.
func WithLocale(ctx context.Context, locale Locale) context.Context {
	return context.WithValue(ctx, contextKey{}, locale)
}

// LocaleFromContext returns the locale stored in ctx, defaulting to English.
func LocaleFromContext(ctx context.Context) Locale {
	if l, ok := ctx.Value(contextKey{}).(Locale); ok {
		return l
	}
	return LocaleEN
}

// T returns the translated string for the given key in the locale stored in ctx.
// Falls back to English, then to the key itself if no translation is found.
func T(ctx context.Context, key string) string {
	locale := LocaleFromContext(ctx)
	if m, ok := messages[locale]; ok {
		if s, ok := m[key]; ok {
			return s
		}
	}
	// Fallback to English
	if locale != LocaleEN {
		if m, ok := messages[LocaleEN]; ok {
			if s, ok := m[key]; ok {
				return s
			}
		}
	}
	return key
}

// Tf returns a translated string with fmt.Sprintf formatting.
func Tf(ctx context.Context, key string, args ...any) string {
	return fmt.Sprintf(T(ctx, key), args...)
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

// supportedMatcher matches Accept-Language tags against supported locales.
var supportedMatcher = language.NewMatcher([]language.Tag{
	language.English,
	language.Norwegian,
})

// ParseAcceptLanguage parses an Accept-Language header and returns the best
// matching supported locale.
func ParseAcceptLanguage(header string) Locale {
	tags, _, err := language.ParseAcceptLanguage(header)
	if err != nil || len(tags) == 0 {
		return LocaleEN
	}
	_, idx, _ := supportedMatcher.Match(tags...)
	switch idx {
	case 1:
		return LocaleNB
	default:
		return LocaleEN
	}
}

// FormatInt formats an integer with locale-appropriate thousands separators.
func FormatInt(ctx context.Context, n int64) string {
	switch LocaleFromContext(ctx) {
	case LocaleNB:
		return formatIntSep(n, '\u00a0') // non-breaking space
	default:
		return formatIntSep(n, ',')
	}
}

// FormatDate formats a time.Time as a long date string for the locale.
func FormatDate(ctx context.Context, t time.Time) string {
	switch LocaleFromContext(ctx) {
	case LocaleNB:
		return t.Format("2. January 2006")
	default:
		return t.Format("January 2, 2006")
	}
}

// FormatDateShort formats a time.Time as a short date string for the locale.
func FormatDateShort(ctx context.Context, t time.Time) string {
	switch LocaleFromContext(ctx) {
	case LocaleNB:
		return t.Format("02.01.2006")
	default:
		return t.Format("2006-01-02")
	}
}

func formatIntSep(n int64, sep rune) string {
	if n < 0 {
		return "-" + formatIntSep(-n, sep)
	}
	if n < 1000 {
		return fmt.Sprintf("%d", n)
	}
	mag := int64(math.Pow10(int(math.Log10(float64(n)/1000))*3 + 3))
	return fmt.Sprintf("%d%c%s", n/mag, sep, formatIntSep(n%mag, sep))
}
