"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Icon } from "@/components/atoms/Icon";

import { Logo, ThemeToggle } from "@/components";

export const Topbar = () => {
    const [scrollPosition, setScrollPosition] = useState<number>(0);
    const [scrolling, setScrolling] = useState<"up" | "down" | undefined>(undefined);

    const [prevScrollPosition, setPrevScrollPosition] = useState<number>(0);

    const handleScroll = useCallback(() => {
        setTimeout(() => {
            setPrevScrollPosition(scrollPosition);
            setScrollPosition(window.scrollY);
        }, 200);
    }, [scrollPosition]);

    useEffect(() => {
        window.addEventListener("scroll", handleScroll, { passive: true });
        if (scrollPosition < 500) {
            setScrolling(undefined);
        } else {
            if (scrollPosition - prevScrollPosition > 0) {
                setScrolling("down");
            } else if (scrollPosition - prevScrollPosition < 0) {
                setScrolling("up");
            }
        }
        handleScroll();
        return () => {
            window.removeEventListener("scroll", handleScroll);
        };
    }, [handleScroll, prevScrollPosition, scrollPosition]);

    return (
        <>
            <div
                data-scrolling={scrolling}
                data-at-top={scrollPosition < 30}
                className="group fixed inset-x-0 z-[60] flex justify-center transition-[top] duration-500 data-[scrolling=down]:-top-full sm:container [&:not([data-scrolling=down])]:top-0 [&:not([data-scrolling=down])]:sm:top-4">
                <div className="flex justify-between items-center group-data-[at-top=false]:bg-base-100 group-data-[at-top=false]:dark:bg-base-200 group-data-[at-top=false]:shadow px-3 sm:px-6 py-3 lg:py-1.5 sm:rounded-full w-full group-data-[at-top=false]:w-[800px] transition-all duration-500">
                    <div className="flex items-center gap-2">
                        <div className="lg:hidden flex-none">
                            <div className="drawer">
                                <input id="landing-menu-drawer" type="checkbox" className="drawer-toggle" />
                                <div className="drawer-content">
                                    <label
                                        htmlFor="landing-menu-drawer"
                                        className="btn drawer-button btn-ghost btn-square btn-sm">
                                        <span className="size-4.5">
                                            <Icon icon="lucide--menu" className="size-4.5" aria-hidden />
                                        </span>
                                    </label>
                                </div>
                                <div className="z-[50] drawer-side">
                                    <label
                                        htmlFor="landing-menu-drawer"
                                        aria-label="close sidebar"
                                        className="drawer-overlay"></label>
                                    <ul className="bg-base-100 p-4 w-80 min-h-full text-base-content menu">
                                        <li>
                                            <Link to="/admin">Dashboard</Link>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <Link to="/admin">
                            <Logo />
                        </Link>
                    </div>
                    <ul className="hidden lg:inline-flex gap-2 px-0 menu menu-horizontal">
                        <li>
                            <Link to="/admin">Dashboard</Link>
                        </li>
                    </ul>
                    <div className="inline-flex items-center gap-3">
                        <ThemeToggle className="border-transparent btn btn-square btn-ghost btn-sm" />
                        <Link
                            to="https://daisyui.com/store/244268?aff=Db6q2"
                            target="_blank"
                            className="group/purchase relative gap-2 bg-linear-to-r from-primary to-secondary border-0 text-primary-content text-sm btn btn-sm max-sm:btn-square">
                            <Icon icon="lucide--shopping-cart" className="size-4" aria-hidden />
                            <span className="max-sm:hidden">Buy Now</span>
                            <div className="top-1 -z-1 absolute inset-x-0 bg-linear-to-r from-primary to-secondary opacity-40 group-hover/purchase:opacity-60 blur-md group-hover/purchase:blur-lg h-8 transition-all duration-500"></div>
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
};
