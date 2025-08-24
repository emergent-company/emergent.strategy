import "swiper/css";
import "swiper/css/parallax";
import { Navigation, Parallax } from "swiper/modules";
import { Swiper, SwiperProps, SwiperSlide } from "swiper/react";

import { carouselDemoImages } from "./helpers";

export const ParallaxDemo = () => {
    const options: SwiperProps = {
        slidesPerView: 1.4,
        centeredSlides: true,
        loop: true,
        speed: 1000,
        spaceBetween: 20,
        navigation: {
            prevEl: ".parallax-carousel-demo-btn-prev",
            nextEl: ".parallax-carousel-demo-btn-next",
        },
        parallax: {},
        modules: [Navigation, Parallax],
    };

    return (
        <div className="relative isolate md:mx-20">
            <Swiper {...options}>
                {carouselDemoImages.map((url, i) => (
                    <SwiperSlide key={i}>
                        <div className="relative h-60 md:h-88">
                            <img
                                src={url}
                                alt="Image"
                                className="rounded-box absolute -z-1 h-60 w-full object-cover md:h-88"
                            />
                            <div className="rounded-box absolute inset-x-0 bottom-0 h-36 bg-linear-to-t from-black to-transparent">
                                <div className="rounded-box px-4 pt-12 text-white md:px-6 md:pt-14">
                                    <p className="font-medium md:text-lg" data-swiper-parallax="-300">
                                        Image #{i + 1}
                                    </p>
                                    <p
                                        className="mt-1 line-clamp-3 text-xs leading-tight opacity-80 md:text-sm"
                                        data-swiper-parallax="-400">
                                        Crisp nature images with forests, mountains, and calm landscapes—perfect for
                                        adding a natural, peaceful touch to websites or design previews.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </SwiperSlide>
                ))}
            </Swiper>
            <div className="absolute -inset-x-16 top-1/2 z-1 flex -translate-y-1/2 justify-between max-md:hidden">
                <button className="parallax-carousel-demo-btn-prev btn btn-circle btn-soft" aria-label="Navigation">
                    <span className="iconify lucide--chevron-left size-5"></span>
                </button>
                <button className="parallax-carousel-demo-btn-next btn btn-circle btn-soft" aria-label="Navigation">
                    <span className="iconify lucide--chevron-right size-5"></span>
                </button>
            </div>
            <div className="absolute start-0 end-0 -bottom-8">
                <div className="swiper-scrollbar"></div>
            </div>
        </div>
    );
};
