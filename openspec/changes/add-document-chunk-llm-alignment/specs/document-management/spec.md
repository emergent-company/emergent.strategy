## ADDED Requirements

### Requirement: Document Chunk LLM Alignment Guidance

The system SHALL provide guidance on the Document Processing settings page to help users align their document chunk sizes with their LLM extraction batch size for optimal extraction performance.

#### Scenario: Display current LLM batch size

- **WHEN** a user views the Document Processing settings page
- **THEN** the system displays the current project's LLM extraction batch size from extraction_config
- **AND** if no extraction_config is set, uses the server default of 30,000 characters

#### Scenario: Calculate and display suggested chunk sizes

- **WHEN** a user views the Document Processing settings page
- **THEN** the system calculates suggested document chunk sizes based on LLM batch size:
  - Suggested max chunk size = LLM batch size / 4
  - Suggested min chunk size = LLM batch size / 10
- **AND** displays these suggestions alongside the current configured values

#### Scenario: Show alignment status indicator

- **WHEN** current max chunk size is within 20% of suggested max chunk size
- **THEN** the system displays a "Well aligned" status with success color

- **WHEN** current max chunk size is within 2x of suggested max chunk size (but not within 20%)
- **THEN** the system displays a "Slightly misaligned" status with warning color

- **WHEN** current max chunk size differs by more than 2x from suggested max chunk size
- **THEN** the system displays a "Misaligned" status with error color

#### Scenario: Apply suggested settings

- **WHEN** alignment status is not "Well aligned" and user clicks "Apply Suggested Settings"
- **THEN** the system updates the form with:
  - maxChunkSize = suggested max chunk size
  - minChunkSize = suggested min chunk size
- **AND** the changes are not saved until user clicks "Save Settings"

#### Scenario: Link to LLM settings

- **WHEN** the LLM batch size is displayed in the alignment card
- **THEN** it is rendered as a link to the LLM Settings page (/admin/settings/project/llm-settings)
- **AND** clicking the link navigates to the LLM Settings page

### Requirement: Aligned Document Chunk Presets

The system SHALL provide document chunking presets that are aligned with LLM extraction batch size presets to ensure optimal extraction performance.

#### Scenario: Precise preset aligned with LLM Conservative

- **WHEN** user selects the "Precise" chunking preset
- **THEN** the system applies:
  - maxChunkSize: 3,750 characters (aligned with LLM 15,000 / 4)
  - minChunkSize: 1,500 characters (aligned with LLM 15,000 / 10)
  - strategy: sentence
- **AND** displays "Aligns with LLM: Conservative (15K)" label

#### Scenario: Balanced preset aligned with LLM Balanced

- **WHEN** user selects the "Balanced" chunking preset
- **THEN** the system applies:
  - maxChunkSize: 7,500 characters (aligned with LLM 30,000 / 4)
  - minChunkSize: 3,000 characters (aligned with LLM 30,000 / 10)
  - strategy: sentence
- **AND** displays "Aligns with LLM: Balanced (30K)" label

#### Scenario: Comprehensive preset aligned with LLM Aggressive

- **WHEN** user selects the "Comprehensive" chunking preset
- **THEN** the system applies:
  - maxChunkSize: 15,000 characters (aligned with LLM 60,000 / 4)
  - minChunkSize: 6,000 characters (aligned with LLM 60,000 / 10)
  - strategy: paragraph
- **AND** displays "Aligns with LLM: Aggressive (60K)" label

#### Scenario: Default configuration uses aligned values

- **WHEN** a project has no chunking_config set
- **THEN** the Document Processing settings page displays default values:
  - maxChunkSize: 7,500 characters
  - minChunkSize: 3,000 characters
  - strategy: sentence
