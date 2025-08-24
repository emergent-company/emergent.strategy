import "swiper/css";
import "swiper/css/grid";
import { Grid, Navigation } from "swiper/modules";
import { Swiper, SwiperProps, SwiperSlide } from "swiper/react";

import { carouselDemoImages } from "./helpers";

export const GridDemo = () => {
    const options: SwiperProps = {
        centeredSlides: true,
        loop: true,
        speed: 1000,
        navigation: {
            prevEl: ".grid-carousel-demo-btn-prev",
            nextEl: ".grid-carousel-demo-btn-next",
        },
        grid: {
            rows: 2,
            fill: "row",
        },
        breakpoints: {
            0: {
                slidesPerView: 1.8,
                spaceBetween: 10,
            },
            768: {
                slidesPerView: 2.8,
                spaceBetween: 12,
            },
            1440: {
                slidesPerView: 3.4,
                spaceBetween: 16,
            },
        },
        modules: [Navigation, Grid],
    };

    return (
        <div className="relative isolate md:mx-20">
            <Swiper {...options}>
                {[...carouselDemoImages, ...carouselDemoImages].map((url, i) => (
                    <SwiperSlide key={i}>
                        <img src={url} alt="Image" className="rounded-box h-40 w-full object-cover md:h-60" />
                    </SwiperSlide>
                ))}
            </Swiper>
            <div className="absolute -inset-x-16 top-1/2 z-1 flex -translate-y-1/2 justify-between max-md:hidden">
                <button className="grid-carousel-demo-btn-prev btn btn-circle btn-soft" aria-label="Navigation">
                    <span className="iconify lucide--chevron-left size-5"></span>
                </button>
                <button className="grid-carousel-demo-btn-next btn btn-circle btn-soft" aria-label="Navigation">
                    <span className="iconify lucide--chevron-right size-5"></span>
                </button>
            </div>
        </div>
    );
};
