# Proposal: Debug Zitadel 500 Error

## Background

The introspection cache is failing to populate because the upstream Zitadel token endpoint is returning a 500 Internal Server Error. This prevents the application from acquiring the service account token needed for introspection.

## Goal

Identify the cause of the Zitadel 500 error by logging the exact parameters used to create the JWT assertion.

## Scope

- `ZitadelService`: Log the `issuer`, `subject`, and `audience` claims being signed in `createJwtAssertion`.

## Risks

- Logging JWT claims is generally safe (no secrets), but we must ensure the _private key_ is never logged.
