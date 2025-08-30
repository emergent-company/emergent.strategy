import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo } from "react";

import { useLocalStorage } from "@/hooks/use-local-storage";

export const themes = ["light", "contrast", "material", "dark", "dim", "material-dark", "system"] as const;

export type ITheme = (typeof themes)[number];

export type IConfig = {
    theme: ITheme;
    direction: "ltr" | "rtl";
    sidebarTheme: "light" | "dark";
    fontFamily: "default" | "dm-sans" | "inclusive" | "ar-one" | "wix";
    fullscreen: boolean;
    activeOrgId?: string;
    activeOrgName?: string;
    activeProjectId?: string;
    activeProjectName?: string;
};

const defaultConfig: IConfig = {
    theme: "system",
    direction: "ltr",
    fontFamily: "default",
    sidebarTheme: "light",
    fullscreen: false,
};

const useHook = () => {
    const [config, setConfig] = useLocalStorage<IConfig>("__NEXUS_CONFIG_v3.0__", defaultConfig);
    const htmlRef = useMemo(() => typeof window !== "undefined" && document.documentElement, []);

    const updateConfig = useCallback(
        (changes: Partial<IConfig>) => {
            setConfig((config) => ({ ...config, ...changes }));
        },
        [setConfig],
    );

    const changeTheme = useCallback((theme: IConfig["theme"]) => {
        updateConfig({ theme });
    }, [updateConfig]);
    const setActiveOrg = (id: string | undefined, name?: string) => {
        updateConfig({ activeOrgId: id, activeOrgName: name, activeProjectId: undefined, activeProjectName: undefined });
    };
    const setActiveProject = (id: string | undefined, name?: string) => {
        updateConfig({ activeProjectId: id, activeProjectName: name });
    };

    const changeSidebarTheme = (sidebarTheme: IConfig["sidebarTheme"]) => {
        updateConfig({ sidebarTheme });
    };
    const changeFontFamily = (fontFamily: IConfig["fontFamily"]) => {
        updateConfig({ fontFamily });
    };

    const changeDirection = (direction: IConfig["direction"]) => {
        updateConfig({ direction });
    };

    const toggleTheme = () => {
        if (["system", "light", "contrast", "material"].includes(config.theme)) {
            changeTheme("dark");
        } else {
            changeTheme("light");
        }
    };

    const toggleFullscreen = () => {
        if (document.fullscreenElement != null) {
            document.exitFullscreen();
        } else if (htmlRef) {
            htmlRef.requestFullscreen();
        }
        updateConfig({ fullscreen: !config.fullscreen });
    };

    const reset = () => {
        setConfig(defaultConfig);
        if (document.fullscreenElement != null) {
            document.exitFullscreen();
        }
    };

    const calculatedSidebarTheme = useMemo(() => {
        return config.sidebarTheme == "dark" && ["light", "contrast"].includes(config.theme) ? "dark" : undefined;
    }, [config.sidebarTheme, config.theme]);

    useEffect(() => {
        const fullscreenMedia = window.matchMedia("(display-mode: fullscreen)");
        const fullscreenListener = () => {
            updateConfig({ fullscreen: fullscreenMedia.matches });
        };
        fullscreenMedia.addEventListener("change", fullscreenListener);

        return () => {
            fullscreenMedia.removeEventListener("change", fullscreenListener);
        };
        // subscribe once on mount; updateConfig is stable via useCallback
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!htmlRef) return;
        if (config.theme == "system") {
            htmlRef.removeAttribute("data-theme");
        } else {
            htmlRef.setAttribute("data-theme", config.theme);
        }
        if (config.fullscreen) {
            htmlRef.setAttribute("data-fullscreen", "");
        } else {
            htmlRef.removeAttribute("data-fullscreen");
        }
        if (config.sidebarTheme) {
            htmlRef.setAttribute("data-sidebar-theme", config.sidebarTheme);
        }
        if (JSON.stringify(config) !== JSON.stringify(defaultConfig)) {
            htmlRef.setAttribute("data-changed", "");
        } else {
            htmlRef.removeAttribute("data-changed");
        }
        if (config.fontFamily !== "default") {
            htmlRef.setAttribute("data-font-family", config.fontFamily);
        } else {
            htmlRef.removeAttribute("data-font-family");
        }
        if (config.direction) {
            htmlRef.dir = config.direction;
        }
    }, [config, htmlRef]);

    return {
        config,
        calculatedSidebarTheme,
        toggleTheme,
        reset,
        changeSidebarTheme,
        changeFontFamily,
        changeTheme,
        changeDirection,
        toggleFullscreen,
        setActiveOrg,
        setActiveProject,
    };
};

const ConfigContext = createContext({} as ReturnType<typeof useHook>);

export const ConfigProvider = ({ children }: { children: ReactNode }) => {
    const value = useHook();
    return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
};

export const useConfig = () => {
    return useContext(ConfigContext);
};
