import "swiper/css";
import "swiper/css/scrollbar";
import { Navigation, Scrollbar } from "swiper/modules";
import { Swiper, SwiperProps, SwiperSlide } from "swiper/react";

import { carouselDemoImages } from "./helpers";

export const ScrollbarDemo = () => {
    const options: SwiperProps = {
        speed: 1000,
        navigation: {
            prevEl: ".scrollbar-carousel-demo-btn-prev",
            nextEl: ".scrollbar-carousel-demo-btn-next",
        },
        scrollbar: {
            el: ".swiper-scrollbar",
            draggable: true,
        },
        breakpoints: {
            0: {
                slidesPerView: 1.8,
                spaceBetween: 12,
            },
            768: {
                slidesPerView: 2.8,
                spaceBetween: 16,
            },
            1440: {
                slidesPerView: 3.4,
                spaceBetween: 20,
            },
        },
        modules: [Navigation, Scrollbar],
    };

    return (
        <div className="relative isolate mb-10 md:mx-20">
            <Swiper {...options}>
                {carouselDemoImages.map((url, i) => (
                    <SwiperSlide key={i}>
                        <img src={url} alt="Image" className="rounded-box h-40 w-full object-cover md:h-60" />
                    </SwiperSlide>
                ))}
            </Swiper>
            <div className="absolute -inset-x-16 top-1/2 z-1 flex -translate-y-1/2 justify-between max-md:hidden">
                <button className="scrollbar-carousel-demo-btn-prev btn btn-circle btn-soft" aria-label="Navigation">
                    <span className="iconify lucide--chevron-left size-5"></span>
                </button>
                <button className="scrollbar-carousel-demo-btn-next btn btn-circle btn-soft" aria-label="Navigation">
                    <span className="iconify lucide--chevron-right size-5"></span>
                </button>
            </div>
            <div className="absolute start-0 end-0 -bottom-8">
                <div className="swiper-scrollbar"></div>
            </div>
        </div>
    );
};
