// Ambient test-only declarations for E2E environment flags.
// Placed under tests/e2e so it's picked up by Vitest (included via pattern) without polluting build output.
// Extends NodeJS.ProcessEnv to provide strong typing for isolation feature flag used across specs.

declare namespace NodeJS {
    interface ProcessEnv {
        /**
         * When set to '1', each E2E test context creates its own org + project ("Isolated Org" / "Isolated Project *").
         * When unset or any other value, tests reuse the shared base fixtures ("E2E Org" / "E2E Project").
         */
        E2E_ISOLATE_ORGS?: '0' | '1';
    }
}

export { };