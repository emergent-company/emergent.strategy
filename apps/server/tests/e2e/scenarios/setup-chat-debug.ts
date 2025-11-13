// Early environment + chat debug setup for scenario tests
// Ensures .env.e2e.scenarios is loaded BEFORE Nest app bootstrap so ChatGenerationService sees flags.
import './helpers/load-env';

if (!process.env.E2E_DEBUG_CHAT) process.env.E2E_DEBUG_CHAT = '1';

// Snapshot key flags very early
// eslint-disable-next-line no-console
console.log('[setup-chat-debug] early flags', {
    GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
    CHAT_MODEL_ENABLED: process.env.CHAT_MODEL_ENABLED,
});

// Provide a helper exported flag (optional future usage)
export const CHAT_DEBUG_EARLY = {
    hasKey: !!process.env.GOOGLE_API_KEY,
    enabledRaw: process.env.CHAT_MODEL_ENABLED,
};
