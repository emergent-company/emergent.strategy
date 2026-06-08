## ADDED Requirements

### Requirement: Edition-aware Navigation

The web UI SHALL show only the phases, tabs, and sub-pages allowed by the instance's
edition. Starter instances SHALL see the Execution tab and a slim READY (North Star +
Roadmap); FIRE and AIM and other READY sub-pages SHALL be hidden or shown as locked
upgrade affordances.

#### Scenario: Starter navigation is slim

- **WHEN** a starter user views a strategy instance
- **THEN** only the Execution tab and the North Star and Roadmap READY pages are shown
- **AND** FIRE and AIM are hidden or rendered as locked upgrade affordances

#### Scenario: Full edition unchanged

- **WHEN** a full-edition user views a strategy instance
- **THEN** all phases, tabs, and sub-pages are shown as before

### Requirement: Edition Route Guard

The web UI SHALL block requests to gated screens for starter instances at request time
and redirect to an upgrade page rather than returning a not-found error.

#### Scenario: Gated route redirects to upgrade

- **WHEN** a starter user navigates directly to a full-only screen URL
- **THEN** the request is redirected to the upgrade page

### Requirement: Upgrade Affordance

The web UI SHALL present an upgrade page or call-to-action describing what the full
edition unlocks.

#### Scenario: Upgrade page describes full edition

- **WHEN** a starter user opens the upgrade affordance
- **THEN** the page describes the capabilities unlocked by upgrading to full
