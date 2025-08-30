import type { StorybookConfig } from "@storybook/react-vite";
import path from "path";

const config: StorybookConfig = {
    framework: {
        name: "@storybook/react-vite",
        options: {},
    },
    staticDirs: ["../public"],
    stories: [
        "../src/**/*.mdx",
        "../src/**/*.stories.@(ts|tsx)",
    ],
    addons: ["@storybook/addon-a11y", "@storybook/addon-links", "@storybook/addon-docs"],
    core: {
        disableTelemetry: true,
    },
    viteFinal: async (baseConfig) => {
        baseConfig.resolve = {
            ...(baseConfig.resolve ?? {}),
            alias: {
                ...(baseConfig.resolve?.alias ?? {}),
                "@": path.resolve(process.cwd(), "src"),
            },
        };
        return baseConfig;
    },
};

export default config;
