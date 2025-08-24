import { useState } from "react";
import "swiper/css";
import "swiper/css/thumbs";
import { Autoplay, Navigation, Thumbs } from "swiper/modules";
import { Swiper, SwiperProps, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperClass } from "swiper/types";

import { carouselDemoImages } from "./helpers";

export const ThumbsDemo = () => {
    const [thumbsSwiper, setThumbsSwiper] = useState<SwiperClass | null>(null);

    const mainOptions: SwiperProps = {
        loop: true,
        speed: 1000,
        autoplay: {
            delay: 5000,
        },
        navigation: {
            prevEl: ".thumbs-carousel-demo-btn-prev",
            nextEl: ".thumbs-carousel-demo-btn-next",
        },
        thumbs: {
            swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null,
        },
        breakpoints: {
            0: {
                slidesPerView: 1,
                spaceBetween: 12,
            },
            768: {
                slidesPerView: 1.2,
                spaceBetween: 16,
            },
            1440: {
                slidesPerView: 1.4,
                spaceBetween: 20,
            },
        },
        modules: [Navigation, Autoplay, Thumbs],
    };

    const thumbOptions: SwiperProps = {
        watchSlidesProgress: true,
        onSwiper: setThumbsSwiper,
        modules: [Thumbs],
        breakpoints: {
            0: {
                slidesPerView: 6,
                spaceBetween: 4,
            },
            768: {
                slidesPerView: 8,
                spaceBetween: 6,
            },
            1440: {
                slidesPerView: 10,
                spaceBetween: 8,
            },
        },
    };

    return (
        <div className="relative isolate md:mx-20">
            <Swiper {...mainOptions}>
                {carouselDemoImages.map((url, i) => (
                    <SwiperSlide key={i}>
                        <img src={url} alt="Image" className="rounded-box h-64 w-full object-cover md:h-90" />
                    </SwiperSlide>
                ))}
            </Swiper>

            <div className="mt-4">
                <Swiper {...thumbOptions}>
                    {carouselDemoImages.map((url, i) => (
                        <SwiperSlide key={i} className="rounded-box overflow-hidden">
                            <img
                                src={url}
                                alt="Thumbnail"
                                className="h-10 w-full cursor-pointer object-cover md:h-16"
                            />
                        </SwiperSlide>
                    ))}
                </Swiper>
            </div>

            <div className="absolute -inset-x-16 top-1/2 z-1 flex -translate-y-1/2 justify-between max-md:hidden">
                <button className="thumbs-carousel-demo-btn-prev btn btn-circle btn-soft" aria-label="Navigation">
                    <span className="iconify lucide--chevron-left size-5"></span>
                </button>
                <button className="thumbs-carousel-demo-btn-next btn btn-circle btn-soft" aria-label="Navigation">
                    <span className="iconify lucide--chevron-right size-5"></span>
                </button>
            </div>
        </div>
    );
};
