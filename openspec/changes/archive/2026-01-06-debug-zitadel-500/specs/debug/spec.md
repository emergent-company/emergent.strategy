# Spec: Debug JWT Assertion

## MODIFIED Requirements

### Requirement: Log JWT Assertion Details

The system MUST log the non-sensitive claims of the JWT assertion to aid in debugging upstream errors.

#### Scenario: Token Acquisition

- **Given** `createJwtAssertion` is called
- **When** preparing the payload
- **Then** log the `issuer`
- **And** log the `subject`
- **And** log the `audience`
- **And** log the `kid` (key ID)
