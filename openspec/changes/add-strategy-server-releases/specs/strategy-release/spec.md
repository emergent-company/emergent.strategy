## ADDED Requirements

### Requirement: Versioned Releases

The system SHALL publish strategy-server releases with semantic versions,
tagged `strategy-server/vX.Y.Z`. A release SHALL be created only when a person
merges the release pull request. An ordinary merge to `main` SHALL NOT create
a release.

While the version is below 1.0.0, a breaking change SHALL raise the minor
version.

#### Scenario: A change accumulates into the release PR
- **WHEN** a pull request whose title is a Conventional Commit is merged to `main` and touches `apps/strategy-server/`
- **THEN** the open release pull request is created or updated with the next version and a changelog entry for that change
- **AND** no tag, GitHub Release or release image is created

#### Scenario: Merging the release PR releases
- **WHEN** a person merges the release pull request
- **THEN** a tag `strategy-server/vX.Y.Z` is created on the merge commit
- **AND** a GitHub Release with the changelog is published for that tag

#### Scenario: Changes outside strategy-server do not move its version
- **WHEN** a merged pull request touches only paths outside `apps/strategy-server/`
- **THEN** the release pull request's proposed version and changelog are unchanged

### Requirement: Release Tags Do Not Trigger Other Apps' Releases

The system SHALL ensure that a strategy-server release cannot start the
epf-cli release or deploy. The epf-cli release workflow SHALL refuse to run
for a tag whose commit range changes nothing under `apps/epf-cli/`.

#### Scenario: A strategy-server tag is pushed
- **WHEN** the tag `strategy-server/vX.Y.Z` is created
- **THEN** the epf-cli release workflow does not run

#### Scenario: A mistyped version tag
- **WHEN** a tag matching `v<digit>…` is pushed on a commit with no change under `apps/epf-cli/` since the previous such tag
- **THEN** the epf-cli release workflow fails in its first job
- **AND** nothing is built, published or deployed
- **AND** the failure message names the `strategy-server/vX.Y.Z` tag scheme

### Requirement: Release Artifacts

Each release SHALL publish a container image built from the tagged commit:

- to a public registry an outside operator can pull from without credentials;
- to the registry the project's own deploy workflow uses.

The GitHub Release SHALL record:

- the image digest;
- the migration files added since the previous release, computed from the
  repository and not written by hand;
- any operator action the release requires.

#### Scenario: Release image is public and versioned
- **WHEN** release X.Y.Z is published
- **THEN** `ghcr.io/emergent-company/strategy-server:X.Y.Z` can be pulled anonymously
- **AND** its digest is stated in the GitHub Release

#### Scenario: Migrations are listed
- **WHEN** release X.Y.Z adds migration files compared with the previous release
- **THEN** the GitHub Release lists each added file under "Migrations in this release"
- **AND** a release that adds none states "No new migrations"

#### Scenario: Operator action is stated
- **WHEN** a release requires operator action beyond deploying the image and running migrations
- **THEN** the GitHub Release has an "Upgrade notes" section describing that action

### Requirement: Build Identifies Its Version

A strategy-server binary or image SHALL report the version it was built as.
A build without a version stamp SHALL report a development version that
includes the source revision. It SHALL NOT report a bare placeholder.

#### Scenario: Released image reports its version
- **WHEN** the image of release X.Y.Z is run with `version`
- **THEN** it prints `X.Y.Z`
- **AND** the server logs `X.Y.Z` at startup
- **AND** `/health` returns `X.Y.Z` in a `version` field

#### Scenario: Unstamped build reports its revision
- **WHEN** strategy-server is built without a version stamp from a git checkout
- **THEN** it reports `dev+<short revision>`, with `-dirty` when the working tree had changes
