// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
// Make eslint-plugin-storybook optional to avoid environment/peer conflicts during installs
let storybookConfigs = [];
try {
    const storybook = await import("eslint-plugin-storybook");
    storybookConfigs = [storybook.configs["flat/recommended"]];
} catch (e) {
    // Plugin not installed or version mismatch; proceed without Storybook rules
    storybookConfigs = [];
}

import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config({ ignores: ["dist", "coverage", "storybook-static"] }, {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
        ecmaVersion: 2020,
        globals: globals.browser,
    },
    plugins: {
        "react-hooks": reactHooks,
        "react-refresh": reactRefresh,
    },
    rules: {
        ...reactHooks.configs.recommended.rules,
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/ban-ts-comment": "off",
        "prefer-const": "off",
        "react-refresh/only-export-components": "off",
        // Forbid runtime imports from reference projects
        "no-restricted-imports": [
            "error",
            {
                "patterns": [
                    {
                        "group": ["reference/*", "@/reference/*", "../../reference/*", "../reference/*", "/reference/*"],
                        "message": "Do not import from reference/ at runtime. Copy code into src/ instead."
                    }
                ]
            }
        ],
    },
}, ...storybookConfigs);
