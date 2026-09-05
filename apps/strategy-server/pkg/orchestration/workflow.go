package orchestration

// Workflow identifies a registrable unit of orchestration. This is the whole
// contract: an engine recovers whatever else it actually needs (e.g.
// DBOSEngine needs CycleSteps() []aim.Step) via a structural cast — see
// internal/aimdbos.cycleStepsProvider — rather than through a larger shared
// interface here.
//
// That split is deliberate, not a relic of having once supported multiple
// engines (it has now outlived two — a legacy pg-backed one, then
// internal/aimadk.ADKEngine): this package stays free of any domain
// dependency (no import of domain/aim, ever), while whichever engine
// package couples to AIM by design recovers the AIM-specific shape it needs
// at the point that actually uses it.
type Workflow interface {
	// Name uniquely identifies this workflow type, e.g. "aim_cycle".
	Name() string
}
