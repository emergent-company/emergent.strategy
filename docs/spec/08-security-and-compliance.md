# Security and Compliance

## Data Protection
- Encryption in transit (TLS) and at rest (KMS-managed keys).
- Least-privilege IAM; per-tenant isolation; RLS in Postgres.
- Secrets management (Vault/Secret Manager); no secrets in logs.

## Access Control
- SSO/OIDC; roles: admin, curator, reader, agent.
- Source-level and document-level ACL mapping to tenant scopes.

## Privacy & PII
- Optional PII redaction at extract stage; opt-in per tenant.
- Data retention and deletion requests honored end-to-end.

## Auditing
- Immutable audit log for access and changes to facts.
- Provenance chain for all derived artifacts.

## Compliance Targets (aspirational)
- SOC2 Type II; GDPR readiness; ISO 27001 alignment.
