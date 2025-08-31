import { Link } from "react-router";
import "swiper/css";
import { Autoplay, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

export const Hero = () => {
    return (
        <div className="relative">
            <div className="-top-2 absolute inset-0 bg-[url(/images/landing/hero-bg-gradient.png)] bg-no-repeat opacity-18 dark:opacity-28 h-[1600px] [background-size:200%_60%] [background-position-x:center] sm:[background-size:100%_100%]" />

            <div className="z-10 relative py-20 sm:py-28 xl:py-40 container">
                <div className="flex flex-col items-center">
                    <Link
                        className="flex items-center gap-1.5 bg-white/40 hover:bg-white/60 dark:bg-white/5 dark:hover:bg-white/10 py-0.5 ps-1 pe-2 border border-white/60 dark:border-white/5 rounded-full text-sm transition-all"
                        to="/admin"
                        target="_self">
                        <div className="flex justify-center items-center bg-primary/10 dark:bg-white/5 px-1.5 py-0 border border-primary/10 dark:border-white/5 rounded-full font-medium text-primary dark:text-white text-xs">
                            v3
                        </div>{" "}
                        Endless Design
                    </Link>
                    <div className="starting:opacity-0 starting:blur-sm mt-4 max-w-[1000px] starting:scale-125 transition-all duration-1000">
                        <p className="font-bold text-2xl sm:text-3xl md:text-4xl lg:text-5xl 2xl:text-6xl text-center leading-tight">
                            Flexible, Quick, Effortless
                            <br />
                            Ultimate{" "}
                            <span className="bg-linear-to-r from-purple-500 dark:from-purple-400 via-blue-500 dark:via-blue-400 to-cyan-600 dark:to-cyan-400 animated-text">
                                Admin Dashboard
                            </span>
                        </p>
                    </div>
                    <div className="starting:opacity-0 starting:blur-sm mt-4 sm:mt-6 xl:mt-8 max-w-[750px] transition-all duration-1000">
                        <p className="max-sm:text-sm md:text-lg text-center">
                            Launch powerful modern dashboards with customizable apps, components, blocks and
                            integrations designed to accelerate workflows and boost efficiency.
                        </p>
                    </div>

                    <div className="inline-flex items-center gap-2.5 sm:gap-5 starting:opacity-0 starting:blur-sm mt-6 xl:mt-10 transition-all duration-1000 delay-300">
                        <Link to="/admin" className="gap-2.5 btn btn-primary btn-lg">
                            <span className="size-5 sm:size-5.5 iconify lucide--monitor-dot" />
                            <div className="text-start">
                                <p className="text-sm/none">Dashboard</p>
                                <p className="mt-px text-[11px]/none text-primary-content/70">Open</p>
                            </div>
                        </Link>
                        <Link
                            to="/admin"
                            className="gap-3 dark:hover:bg-white dark:border-white !border-transparent dark:hover:text-black dark:text-white text-base btn btn-ghost btn-neutral btn-lg">
                            <span className="lucide--blocks size-5 sm:size-5.5 iconify" />
                            Explore
                        </Link>
                    </div>
                    <div className="group relative mt-8 md:mt-16 xl:mt-20 max-w-full md:max-w-xl lg:max-w-3xl xl:max-w-5xl 2xl:max-w-6xl">
                        <div className="relative bg-base-100/30 dark:bg-white/4 py-2 border-2 dark:border-px dark:border-white/2 border-base-100/20 rounded-lg">
                            <Swiper
                                slidesPerView={1}
                                cardsEffect={{
                                    rotate: false,
                                    perSlideOffset: 10,
                                    slideShadows: false,
                                }}
                                loop
                                speed={1500}
                                autoplay={{
                                    delay: 5000,
                                }}
                                spaceBetween={0}
                                navigation={{
                                    prevEl: ".hero-swiper-button-prev",
                                    nextEl: ".hero-swiper-button-next",
                                }}
                                modules={[Navigation, Pagination, Autoplay]}>
                                <SwiperSlide>
                                    <div className="mx-2 cursor-pointer">
                                        <Link className="relative" to="/admin">
                                            <img
                                                src="/images/landing/dashboard-ecommerce-light.jpg"
                                                className="dark:hidden rounded-lg w-full h-full"
                                                alt="hero-landing"
                                            />
                                            <img
                                                src="/images/landing/dashboard-ecommerce-dark.jpg"
                                                className="hidden dark:block rounded-lg w-full h-full"
                                                alt="hero-landing"
                                            />
                                            <div className="absolute inset-0 flex justify-center items-end bg-linear-to-b from-[50%] from-transparent via-[80%] via-black/20 to-black/80 opacity-0 group-hover:opacity-100 rounded-lg transition-all duration-300">
                                                <div className="gap-2.5 bg-white mb-8 px-4 py-2 rounded-box font-medium text-black/80 text-sm">
                                                    Ecommerce Dashboard
                                                </div>
                                            </div>
                                        </Link>
                                    </div>
                                </SwiperSlide>

                                <SwiperSlide>
                                    <div className="mx-2 cursor-pointer">
                                        <Link className="relative" to="/admin">
                                            <img
                                                src="/images/landing/dashboard-crm-light.jpg"
                                                className="dark:hidden rounded-lg w-full h-full"
                                                alt="hero-landing"
                                            />
                                            <img
                                                src="/images/landing/dashboard-crm-dark.jpg"
                                                className="hidden dark:block rounded-lg w-full h-full"
                                                alt="hero-landing"
                                            />
                                            <div className="absolute inset-0 flex justify-center items-end bg-linear-to-b from-[50%] from-transparent via-[80%] via-black/20 to-black/80 opacity-0 group-hover:opacity-100 rounded-lg transition-all duration-300">
                                                <div className="gap-2.5 bg-white mb-8 px-4 py-2 rounded-box font-medium text-black/80 text-sm">
                                                    CRM Dashboard
                                                </div>
                                            </div>
                                        </Link>
                                    </div>
                                </SwiperSlide>

                                <SwiperSlide>
                                    <div className="mx-2 cursor-pointer">
                                        <Link className="relative" to="/admin">
                                            <img
                                                src="/images/landing/dashboard-gen-ai-light.jpg"
                                                className="dark:hidden rounded-lg w-full h-full"
                                                alt="hero-landing"
                                            />
                                            <img
                                                src="/images/landing/dashboard-gen-ai-dark.jpg"
                                                className="hidden dark:block rounded-lg w-full h-full"
                                                alt="hero-landing"
                                            />
                                            <div className="absolute inset-0 flex justify-center items-end bg-linear-to-b from-[50%] from-transparent via-[80%] via-black/20 to-black/80 opacity-0 group-hover:opacity-100 rounded-lg transition-all duration-300">
                                                <div className="gap-2.5 bg-white mb-8 px-4 py-2 rounded-box font-medium text-black/80 text-sm">
                                                    Gen AI Dashboard
                                                </div>
                                            </div>
                                        </Link>
                                    </div>
                                </SwiperSlide>
                                <SwiperSlide>
                                    <div className="mx-2 cursor-pointer">
                                        <Link className="relative" to="/admin">
                                            <img
                                                src="/images/landing/components-home-light.jpg"
                                                className="dark:hidden rounded-lg w-full h-full"
                                                alt="hero-landing"
                                            />
                                            <img
                                                src="/images/landing/components-home-dark.jpg"
                                                className="hidden dark:block rounded-lg w-full h-full"
                                                alt="hero-landing"
                                            />
                                            <div className="absolute inset-0 flex justify-center items-end bg-linear-to-b from-[50%] from-transparent via-[80%] via-black/20 to-black/80 opacity-0 group-hover:opacity-100 rounded-lg transition-all duration-300">
                                                <div className="gap-2.5 bg-white mb-8 px-4 py-2 rounded-box font-medium text-black/80 text-sm">
                                                    Explore
                                                </div>
                                            </div>
                                        </Link>
                                    </div>
                                </SwiperSlide>
                            </Swiper>
                        </div>
                        <div className="md:top-1/2 max-md:-bottom-12 z-1 absolute md:-inset-x-24 flex justify-between max-md:gap-3 opacity-0 group-hover:opacity-100 transition-all max-md:-translate-x-1/2 md:-translate-y-1/2 duration-300 max-md:start-1/2">
                            <button className="flex justify-center items-center bg-white dark:bg-white/10 dark:hover:bg-white/20 shadow-xs max-md:shadow hover:shadow-md dark:border-white/10 border-base-200 rounded-full size-8 md:size-10 transition-all cursor-pointer hero-swiper-button-prev">
                                <span className="lucide--chevron-left size-5 iconify"></span>
                            </button>
                            <button className="flex justify-center items-center bg-white dark:bg-white/10 dark:hover:bg-white/20 shadow-xs max-md:shadow hover:shadow-md dark:border-white/10 border-base-200 rounded-full size-8 md:size-10 transition-all cursor-pointer hero-swiper-button-next">
                                <span className="lucide--chevron-right size-5 iconify"></span>
                            </button>
                        </div>
                    </div>

                    <div className="mt-8 sm:mt-12 lg:mt-16 text-center">
                        <p className="font-medium text-base-content/60">Available In</p>
                        <div className="flex flex-wrap justify-center items-center gap-6 mt-4">
                            <div className="tooltip" data-tip="Tailwind CSS 4">
                                <img
                                    src="/images/landing/logo-tailwind.svg"
                                    className="size-7 sm:size-9"
                                    alt="Tailwind CSS"
                                />
                            </div>
                            <div className="tooltip" data-tip="daisyUI 5 - Component Library">
                                <img
                                    src="/images/landing/logo-daisyui.svg"
                                    className="size-7 sm:size-9"
                                    alt="DaisyUI"
                                />
                            </div>
                            <div className="tooltip" data-tip="Alpine.js">
                                <img
                                    src="/images/landing/logo-alpinejs.svg"
                                    className="size-8 sm:size-11"
                                    alt="Alpine.js"
                                />
                            </div>

                            <div className="tooltip" data-tip="Typescript">
                                <img src="/images/landing/logo-ts.svg" className="size-7 sm:size-9" alt="Typescript" />
                            </div>
                            <div className="tooltip" data-tip="Vite">
                                <img src="/images/landing/logo-vite.svg" className="size-7 sm:size-9" alt="Vite" />
                            </div>

                            <div className="tooltip" data-tip="React 19">
                                <img src="/images/landing/logo-react.svg" className="size-7 sm:size-9" alt="React" />
                            </div>

                            <div className="tooltip" data-tip="Next.JS 15">
                                <img
                                    src="/images/landing/logo-next.svg"
                                    className="dark:invert size-7 sm:size-9"
                                    alt="Next.JS"
                                />
                            </div>
                            <div className="tooltip" data-tip="SvelteKit 2">
                                <img
                                    src="/images/landing/logo-svelte.svg"
                                    className="size-7 sm:size-9"
                                    alt="SvelteKit 2"
                                />
                            </div>
                            <div className="tooltip" data-tip="Nuxt 4">
                                <img src="/images/landing/logo-nuxt.svg" className="size-8 sm:size-10" alt="Nuxt 4" />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="max-xl:hidden top-60 absolute opacity-80 dark:opacity-60 animate-bounce-slow start-16">
                    <img src="/images/landing/hero-widget-1.png" className="h-30" alt="Hero 1" />
                </div>
                <div className="max-xl:hidden top-160 absolute opacity-80 dark:opacity-60 animate-bounce-slow end-0">
                    <img src="/images/landing/hero-widget-2.png" className="h-30" alt="Hero 2" />
                </div>
            </div>
        </div>
    );
};
