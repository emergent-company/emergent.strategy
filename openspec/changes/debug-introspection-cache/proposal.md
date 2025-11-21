# Proposal: Debug Introspection Cache

## Background

The user reports persistent introspection cache misses despite previous fixes. They suspect a bug in cache key generation or logic.

## Goal

Instrument the caching and token acquisition logic with verbose debug logging to identify the root cause.

## Scope

- `PostgresCacheService`: Log token hash generation and cache statistics on miss.
- `ZitadelService`: Log internal state of client token cache and token response details.
