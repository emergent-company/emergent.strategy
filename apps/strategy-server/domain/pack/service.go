// Package pack manages skill pack installation, resolution, and the standard pack.
//
// Skill resolution priority order:
//  1. installed_skills table (per-instance, from packs)
//  2. canonical embedded skills/ FS
//  3. legacy outputs/ generators (synthesised as generator-alias skills)
//
// The standard pack ("emergent-standard") is a versioned installable pack
// constructed at runtime from the embedded skills/ FS. It is auto-installed
// into new instances via EnsureStandardPack, which runs post-commit to avoid
// blocking instance creation.
package pack

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// StandardPackName is the name of the canonical built-in skill pack.
const StandardPackName = "emergent-standard"

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// Service manages skill pack installation and skill resolution for instances.
type Service struct {
	db *bun.DB
}

// NewService creates a new pack Service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ResolvedSkill is the unified view of a skill resolved for an instance,
// regardless of whether it came from an installed pack, the canonical embedded
// skills, or the legacy generator alias path.
type ResolvedSkill struct {
	SkillName     string  `json:"skill_name"`
	SkillYAML     string  `json:"skill_yaml"`
	PromptMD      *string `json:"prompt_md,omitempty"`
	ScriptSrc     *string `json:"script_src,omitempty"`
	ScriptLang    *string `json:"script_lang,omitempty"`
	ExecutionMode string  `json:"execution"` // prompt | script | inline
	Type          string  `json:"type"`
	Source        string  `json:"source"` // installed | canonical | generator-alias
	PackName      *string `json:"pack_name,omitempty"`
	PackVersion   *string `json:"pack_version,omitempty"`
	Trusted       bool    `json:"trusted"`
}

// SkillBundle holds the content of a single skill within a pack.
type SkillBundle struct {
	Name       string
	SkillYAML  string
	PromptMD   *string
	ScriptSrc  *string
	ScriptLang *string
}

// PackManifest is the parsed pack.yaml top-level structure.
type PackManifest struct {
	Name        string `yaml:"name"`
	Version     string `yaml:"version"`
	Description string `yaml:"description"`
	Author      string `yaml:"author"`
	Trusted     bool   `yaml:"trusted"`
}

// PackBundle is the parsed install payload for a skill pack.
type PackBundle struct {
	Manifest PackManifest
	Skills   []SkillBundle
}

// InstalledPackSummary is a grouped view of all skills belonging to one pack.
type InstalledPackSummary struct {
	PackName    string `json:"pack_name"`
	PackVersion string `json:"pack_version"`
	SkillCount  int    `json:"skill_count"`
	Trusted     bool   `json:"trusted"`
	InstalledAt string `json:"installed_at"`
}

// ---------------------------------------------------------------------------
// ParsePackBundle
// ---------------------------------------------------------------------------

// skillYAMLMeta is the minimal parsed shape of a skill.yaml for validation.
type skillYAMLMeta struct {
	Name      string `yaml:"name"`
	Version   string `yaml:"version"`
	Type      string `yaml:"type"`
	Execution string `yaml:"execution"`
}

// ParsePackBundle validates and parses an install request into a PackBundle.
// packYAML is the raw pack.yaml content. skills is the list of skill bundles
// as provided by the caller (already split into individual fields).
func ParsePackBundle(packYAML string, skills []SkillBundle) (*PackBundle, error) {
	var manifest PackManifest
	if err := yaml.Unmarshal([]byte(packYAML), &manifest); err != nil {
		return nil, fmt.Errorf("invalid pack.yaml: %w", err)
	}
	if manifest.Name == "" {
		return nil, fmt.Errorf("pack.yaml missing required field: name")
	}
	if manifest.Version == "" {
		return nil, fmt.Errorf("pack.yaml missing required field: version")
	}

	for i, s := range skills {
		if s.SkillYAML == "" {
			return nil, fmt.Errorf("skill[%d]: skill_yaml is required", i)
		}
		var meta skillYAMLMeta
		if err := yaml.Unmarshal([]byte(s.SkillYAML), &meta); err != nil {
			return nil, fmt.Errorf("skill[%d]: invalid skill.yaml: %w", i, err)
		}
		if meta.Name == "" {
			return nil, fmt.Errorf("skill[%d]: skill.yaml missing required field: name", i)
		}
		if meta.Type == "" {
			return nil, fmt.Errorf("skill[%d] %q: skill.yaml missing required field: type", i, meta.Name)
		}
		// Reject inline execution for installed skills — reserved for core embedded skills.
		if strings.EqualFold(meta.Execution, "inline") {
			return nil, fmt.Errorf("skill %q: execution: inline is reserved for canonical core skills; use prompt or script", meta.Name)
		}
	}

	return &PackBundle{
		Manifest: manifest,
		Skills:   skills,
	}, nil
}

// ---------------------------------------------------------------------------
// InstallPack
// ---------------------------------------------------------------------------

// InstallPack installs all skills from bundle into installed_skills for instanceID.
// If a pack with the same name is already installed and force is false, it returns
// an error. With force=true, existing skills for the pack are replaced atomically.
func (s *Service) InstallPack(ctx context.Context, instanceID uuid.UUID, bundle *PackBundle, force bool) error {
	actor := audit.ActorFromContext(ctx)
	installedBy := "system"
	if actor != nil {
		installedBy = actor.String()
	}

	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		// Check if pack already installed.
		var existing domain.InstalledSkill
		err := tx.NewSelect().Model(&existing).
			Where("instance_id = ? AND pack_name = ?", instanceID, bundle.Manifest.Name).
			Limit(1).
			Scan(ctx)
		alreadyInstalled := err == nil
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("check existing pack: %w", err)
		}

		if alreadyInstalled && !force {
			return apperror.ErrConflict.WithDetail(
				fmt.Sprintf("pack %q is already installed; use force: true to upgrade", bundle.Manifest.Name))
		}

		// Remove existing skills for this pack if force-upgrading.
		if alreadyInstalled {
			if _, err := tx.NewDelete().Model((*domain.InstalledSkill)(nil)).
				Where("instance_id = ? AND pack_name = ?", instanceID, bundle.Manifest.Name).
				Exec(ctx); err != nil {
				return fmt.Errorf("remove existing pack skills: %w", err)
			}
		}

		// Insert all skills.
		for _, sb := range bundle.Skills {
			skill := &domain.InstalledSkill{
				ID:          uuid.New(),
				InstanceID:  instanceID,
				PackName:    bundle.Manifest.Name,
				PackVersion: bundle.Manifest.Version,
				SkillName:   sb.Name,
				SkillYAML:   sb.SkillYAML,
				PromptMD:    sb.PromptMD,
				ScriptSrc:   sb.ScriptSrc,
				ScriptLang:  sb.ScriptLang,
				Trusted:     bundle.Manifest.Trusted,
				InstalledBy: installedBy,
			}
			if _, err := tx.NewInsert().Model(skill).Exec(ctx); err != nil {
				return fmt.Errorf("insert skill %q: %w", sb.Name, err)
			}
		}

		return nil
	})
}

// ---------------------------------------------------------------------------
// UninstallPack
// ---------------------------------------------------------------------------

// UninstallPack removes all installed_skills rows for packName from the instance.
// Returns the number of skills removed. Returns ErrNotFound if the pack is not installed.
func (s *Service) UninstallPack(ctx context.Context, instanceID uuid.UUID, packName string) (int, error) {
	res, err := s.db.NewDelete().Model((*domain.InstalledSkill)(nil)).
		Where("instance_id = ? AND pack_name = ?", instanceID, packName).
		Exec(ctx)
	if err != nil {
		return 0, fmt.Errorf("uninstall pack %q: %w", packName, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return 0, apperror.ErrNotFound.WithDetail(
			fmt.Sprintf("pack %q is not installed for this instance", packName))
	}
	return int(n), nil
}

// ---------------------------------------------------------------------------
// ListInstalledPacks
// ---------------------------------------------------------------------------

// ListInstalledPacks returns one summary per distinct (pack_name, pack_version)
// installed for the instance.
func (s *Service) ListInstalledPacks(ctx context.Context, instanceID uuid.UUID) ([]*InstalledPackSummary, error) {
	type row struct {
		PackName    string `bun:"pack_name"`
		PackVersion string `bun:"pack_version"`
		SkillCount  int    `bun:"skill_count"`
		Trusted     bool   `bun:"trusted"`
		InstalledAt string `bun:"installed_at"`
	}
	var rows []row
	err := s.db.NewSelect().
		TableExpr("installed_skills").
		ColumnExpr("pack_name, pack_version, COUNT(*) AS skill_count, bool_or(trusted) AS trusted, MIN(installed_at)::TEXT AS installed_at").
		Where("instance_id = ?", instanceID).
		GroupExpr("pack_name, pack_version").
		OrderExpr("MIN(installed_at) ASC").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("list installed packs: %w", err)
	}
	out := make([]*InstalledPackSummary, len(rows))
	for i, r := range rows {
		out[i] = &InstalledPackSummary{
			PackName:    r.PackName,
			PackVersion: r.PackVersion,
			SkillCount:  r.SkillCount,
			Trusted:     r.Trusted,
			InstalledAt: r.InstalledAt,
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// ResolveSkill
// ---------------------------------------------------------------------------

// ResolveSkill resolves a skill by name for an instance using the priority order:
//  1. installed_skills table (per-instance)
//  2. canonical embedded skills/
//  3. legacy outputs/ generator alias
func (s *Service) ResolveSkill(ctx context.Context, instanceID uuid.UUID, skillName string) (*ResolvedSkill, error) {
	// 1. Installed skills take precedence.
	var row domain.InstalledSkill
	err := s.db.NewSelect().Model(&row).
		Where("instance_id = ? AND skill_name = ?", instanceID, skillName).
		OrderExpr("installed_at DESC").
		Limit(1).
		Scan(ctx)
	if err == nil {
		return installedSkillToResolved(&row), nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("resolve skill %q from db: %w", skillName, err)
	}

	// 2 & 3. Fall through to embedded.
	return resolveFromEmbedded(skillName)
}

// ListAvailableSkills returns all skills available for an instance: installed skills
// union canonical embedded skills, with installed taking precedence by name.
func (s *Service) ListAvailableSkills(ctx context.Context, instanceID uuid.UUID, sourceFilter string) ([]*ResolvedSkill, error) {
	// Collect installed skills.
	var installedRows []domain.InstalledSkill
	if err := s.db.NewSelect().Model(&installedRows).
		Where("instance_id = ?", instanceID).
		OrderExpr("skill_name ASC").
		Scan(ctx); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("list installed skills: %w", err)
	}

	installedMap := make(map[string]*ResolvedSkill, len(installedRows))
	for i := range installedRows {
		r := installedSkillToResolved(&installedRows[i])
		installedMap[r.SkillName] = r
	}

	var out []*ResolvedSkill

	if sourceFilter == "installed" {
		for _, r := range installedMap {
			out = append(out, r)
		}
		return sortByName(out), nil
	}

	if sourceFilter == "canonical" {
		// Return canonical skills only — no installed skills, no shadowing.
		names, _ := embedded.ListSkills()
		for _, name := range names {
			r, err := resolveFromEmbedded(name)
			if err == nil {
				out = append(out, r)
			}
		}
		return sortByName(out), nil
	}

	// sourceFilter == "" || "all": canonical + installed; installed takes precedence by name.
	names, _ := embedded.ListSkills()
	for _, name := range names {
		if _, shadowed := installedMap[name]; shadowed {
			continue
		}
		r, err := resolveFromEmbedded(name)
		if err == nil {
			out = append(out, r)
		}
	}

	// Merge installed (installed always wins over canonical with same name).
	for _, r := range installedMap {
		out = append(out, r)
	}

	return sortByName(out), nil
}

// ---------------------------------------------------------------------------
// EnsureStandardPack
// ---------------------------------------------------------------------------

// EnsureStandardPack installs the emergent-standard pack into the instance if it
// is not already present. It constructs the pack bundle from the embedded skills/ FS.
// On success, it also updates strategy_instances.standard_pack_version.
// This is designed to be called post-commit (outside the instance creation transaction).
func (s *Service) EnsureStandardPack(ctx context.Context, instanceID uuid.UUID) error {
	version := strings.TrimSpace(embedded.Version)

	// Idempotency check: already installed?
	var existing domain.InstalledSkill
	err := s.db.NewSelect().Model(&existing).
		Where("instance_id = ? AND pack_name = ?", instanceID, StandardPackName).
		Limit(1).Scan(ctx)
	if err == nil {
		return nil // already installed
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("ensure standard pack: check existing: %w", err)
	}

	// Build bundle from embedded skills.
	skillNames, err := embedded.ListSkills()
	if err != nil {
		return fmt.Errorf("ensure standard pack: list skills: %w", err)
	}

	var bundles []SkillBundle
	for _, name := range skillNames {
		yamlData, err := embedded.GetSkillYAML(name)
		if err != nil {
			continue // skip unreadable skills
		}

		// Skip inline-execution skills — they are canonical-only and cannot
		// be stored as installed_skills rows.
		var meta skillYAMLMeta
		if err := yaml.Unmarshal(yamlData, &meta); err == nil &&
			strings.EqualFold(meta.Execution, "inline") {
			continue
		}

		sb := SkillBundle{
			Name:      name,
			SkillYAML: string(yamlData),
		}
		if promptData, err := embedded.GetSkillPrompt(name); err == nil && len(promptData) > 0 {
			s := string(promptData)
			sb.PromptMD = &s
		}
		bundles = append(bundles, sb)
	}

	packYAML := fmt.Sprintf("name: %s\nversion: %q\ndescription: \"Standard Emergent skill library\"\nauthor: \"Emergent\"\ntrusted: true\n",
		StandardPackName, version)

	bundle, err := ParsePackBundle(packYAML, bundles)
	if err != nil {
		return fmt.Errorf("ensure standard pack: parse bundle: %w", err)
	}

	if err := s.InstallPack(ctx, instanceID, bundle, false); err != nil {
		return fmt.Errorf("ensure standard pack: install: %w", err)
	}

	// Update standard_pack_version on the instance row.
	_, err = s.db.NewUpdate().
		TableExpr("strategy_instances").
		Set("standard_pack_version = ?", version).
		Where("id = ?", instanceID).
		Exec(ctx)
	if err != nil {
		// Non-fatal: the pack is installed; just the version column is stale.
		return fmt.Errorf("ensure standard pack: update version column: %w", err)
	}

	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func installedSkillToResolved(row *domain.InstalledSkill) *ResolvedSkill {
	r := &ResolvedSkill{
		SkillName:  row.SkillName,
		SkillYAML:  row.SkillYAML,
		PromptMD:   row.PromptMD,
		ScriptSrc:  row.ScriptSrc,
		ScriptLang: row.ScriptLang,
		Source:     "installed",
		Trusted:    row.Trusted,
	}
	pn := row.PackName
	pv := row.PackVersion
	r.PackName = &pn
	r.PackVersion = &pv

	// Parse execution mode and type from stored YAML.
	r.ExecutionMode = extractField(row.SkillYAML, "execution")
	if r.ExecutionMode == "" {
		r.ExecutionMode = "prompt"
	}
	r.Type = extractField(row.SkillYAML, "type")
	if r.Type == "" {
		r.Type = "creation"
	}
	return r
}

func resolveFromEmbedded(name string) (*ResolvedSkill, error) {
	core, err := embedded.ResolveSkill(name)
	if err != nil {
		return nil, err
	}
	r := &ResolvedSkill{
		SkillName: core.Name,
		SkillYAML: string(core.SkillYAML),
		Type:      core.Type,
		Source:    string(core.Source),
		Trusted:   true, // canonical skills are always trusted
	}
	if len(core.PromptMD) > 0 {
		s := string(core.PromptMD)
		r.PromptMD = &s
	}
	r.ExecutionMode = extractField(string(core.SkillYAML), "execution")
	if r.ExecutionMode == "" {
		r.ExecutionMode = "prompt"
	}
	return r, nil
}

// extractField does a simple line-scan for a top-level YAML scalar field.
func extractField(yamlSrc, field string) string {
	prefix := field + ": "
	for _, line := range strings.Split(yamlSrc, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), prefix) {
			val := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), prefix))
			return strings.Trim(val, "\"'")
		}
	}
	return ""
}

// sortByName returns skills sorted alphabetically by skill name.
func sortByName(skills []*ResolvedSkill) []*ResolvedSkill {
	for i := 1; i < len(skills); i++ {
		for j := i; j > 0 && skills[j].SkillName < skills[j-1].SkillName; j-- {
			skills[j], skills[j-1] = skills[j-1], skills[j]
		}
	}
	return skills
}
