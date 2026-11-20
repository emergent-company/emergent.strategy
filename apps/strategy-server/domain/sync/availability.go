package sync

import "time"

// Values for Availability.State.
const (
	// AvailabilityEnabled: the GitHub App is configured, verified and has the
	// permissions sync needs.
	AvailabilityEnabled = "enabled"
	// AvailabilityDisabled: the sync tools are not registered. The App is not
	// configured, or its client could not be created.
	AvailabilityDisabled = "disabled"
	// AvailabilityDegraded: the sync tools are registered, but the server saw at
	// startup that they will not work fully (the App could not be verified, or
	// lacks the permissions to push).
	AvailabilityDegraded = "degraded"
)

// Availability says whether GitHub sync works on this server and, when it does
// not, why. It is observed once at startup and does not change while the server
// runs.
type Availability struct {
	State     string    `json:"state"`
	Reason    string    `json:"reason,omitempty"`
	CheckedAt time.Time `json:"checked_at,omitempty"`
}
