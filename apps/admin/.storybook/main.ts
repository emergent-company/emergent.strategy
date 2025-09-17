import type { StorybookConfig } from "@storybook/react-vite";
import path from "path";

const config: StorybookConfig = {
    framework: {
        name: "@storybook/react-vite",
        options: {},
    },
    staticDirs: ["../public"],
    stories: [
        "../src/**/*.stories.@(ts|tsx)",
    ],
    addons: [
        "@storybook/addon-a11y",
        "@storybook/addon-links",
        "@storybook/addon-docs"
    ],
    docs: {},
    core: {
        disableTelemetry: true,
    },
    viteFinal: async (baseConfig) => {
        baseConfig.resolve = {
            ...(baseConfig.resolve ?? {}),
            alias: {
                ...(baseConfig.resolve?.alias ?? {}),
                // Resolve to admin app's src regardless of invocation CWD
                "@": path.resolve(__dirname, "../src"),
            },
        };
        return baseConfig;
    },
};

export default config;
