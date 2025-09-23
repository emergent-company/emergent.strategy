import type { Decorator } from "@storybook/react";
import React, { useEffect } from "react";
import { ConfigProvider, useConfig, type ITheme } from "../src/contexts/config";
import { AuthProvider } from "../src/contexts/auth";
import { MemoryRouter } from "react-router";

import "../src/styles/app.css";

const ThemeSync: React.FC<{ theme: string }> = ({ theme }) => {
    const { changeTheme, config } = useConfig();
    useEffect(() => {
        // Map SB themes to our config themes
        const mapped: ITheme = theme === "dark" ? "dark" : theme === "light" ? "light" : "system";
        if (config.theme !== mapped) {
            changeTheme(mapped);
        }
    }, [theme, changeTheme, config.theme]);
    return null;
};

const withConfigProvider: Decorator = (Story, context) => {
    const theme = (context.globals as { theme?: string }).theme || "light";
    const initialPath = (context.parameters as { location?: string }).location || "/admin/documents";
    if (typeof document !== "undefined") {
        document.documentElement.classList.add("group/html");
    }
    return (
        <MemoryRouter initialEntries={[initialPath]}>
            <ConfigProvider>
                <AuthProvider>
                    <ThemeSync theme={theme} />
                    <div className="bg-base-100 p-4 min-h-screen text-base-content">
                        <Story />
                    </div>
                </AuthProvider>
            </ConfigProvider>
        </MemoryRouter>
    );
};

export const decorators = [withConfigProvider];

export const globalTypes = {
    theme: {
        name: "Theme",
        description: "Global theme for components",
        defaultValue: "light",
        toolbar: {
            icon: "circlehollow",
            items: [
                { value: "light", title: "Light" },
                { value: "dark", title: "Dark" },
                { value: "system", title: "System" },
            ],
        },
    },
};

export const parameters = {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
        matchers: {
            color: /(background|color)$/i,
            date: /Date$/,
        },
    },
    backgrounds: {
        default: "base",
        values: [
            { name: "base", value: "oklch(98% 0.02 240)" },
            { name: "dark", value: "#121416" },
        ],
    },
    docs: {
        // Enable the modern Storybook Code panel (replacement for deprecated storysource addon)
        codePanel: true,
        source: { state: 'open' },
    },
};
