import "swiper/css";
import "swiper/css/effect-coverflow";
import { Autoplay, EffectCoverflow, Navigation } from "swiper/modules";
import { Swiper, SwiperProps, SwiperSlide } from "swiper/react";

import { carouselDemoImages } from "./helpers";

export const CoverflowDemo = () => {
    const options: SwiperProps = {
        centeredSlides: true,
        loop: true,
        speed: 1000,
        autoplay: {
            delay: 5000,
        },
        effect: "coverflow",
        navigation: {
            prevEl: ".coverflow-carousel-demo-btn-prev",
            nextEl: ".coverflow-carousel-demo-btn-next",
        },
        coverflowEffect: {
            scale: 0.85,
            stretch: 0,
            rotate: 0,
        },
        breakpoints: {
            0: {
                slidesPerView: 1.6,
                spaceBetween: 4,
            },
            768: {
                slidesPerView: 2.8,
                spaceBetween: 6,
            },
            1440: {
                slidesPerView: 3.4,
                spaceBetween: 8,
            },
        },
        modules: [Navigation, Autoplay, EffectCoverflow],
    };
    return (
        <div className="relative isolate md:mx-20">
            <Swiper {...options}>
                {carouselDemoImages.map((url, i) => (
                    <SwiperSlide key={i}>
                        <img src={url} alt="Image" className="rounded-box h-44 w-full object-cover md:h-60" />
                    </SwiperSlide>
                ))}
            </Swiper>
            <div className="absolute -inset-x-16 top-1/2 z-1 flex -translate-y-1/2 justify-between max-md:hidden">
                <button className="coverflow-carousel-demo-btn-prev btn btn-circle btn-soft" aria-label="Navigation">
                    <span className="iconify lucide--chevron-left size-5"></span>
                </button>
                <button className="coverflow-carousel-demo-btn-next btn btn-circle btn-soft" aria-label="Navigation">
                    <span className="iconify lucide--chevron-right size-5"></span>
                </button>
            </div>
        </div>
    );
};
