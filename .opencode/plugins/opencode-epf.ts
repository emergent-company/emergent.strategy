/**
 * Local development shim for the opencode-epf plugin.
 * Loads the plugin from the packages/opencode-epf source directory.
 *
 * For production, add "opencode-epf" to the "plugin" array in opencode.json
 * and install via npm instead.
 */
export { EPFPlugin } from "../../packages/opencode-epf/src/index";
