import { Icon } from "@/components/atoms/Icon";
import "swiper/css";
import { Autoplay, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

const testimonials = [
    {
        id: "landing-testimonial-1",
        image: "/images/landing/testimonial-avatar-1.jpg",
        name: "Pouya Saadeghi",
        role: "Creator of daisyUI",
        comment:
            "This is the ultimate admin dashboard template, with all the essential blocks and features you need. Save you months of development time and helps you launch your app faster",
    },
    {
        id: "landing-testimonial-2",
        image: "/images/landing/testimonial-avatar-2.jpg",
        name: "Alexandre Cohen",
        role: "Co-owner / CTO of Disphere",
        comment:
            "Exceptional dashboard with a sleek design and seamless integration of DaisyUI components. Perfect for my existing project !",
    },
] as const;

export const Testimonial = () => {
    return (
        <section id="testimonial" className="relative py-8 md:py-12 2xl:py-24 xl:py-16 container">
            <div className="absolute inset-0 bg-[url('/images/landing/testimonial-background.svg')] bg-cover bg-no-repeat bg-center opacity-8 dark:opacity-6"></div>

            <div className="relative">
                <div className="text-center">
                    <div className="inline-flex items-center bg-orange-500/5 p-2 border border-orange-500/10 rounded-box">
                        <Icon icon="lucide--sparkles" className="size-5 text-orange-600" aria-hidden />
                    </div>
                    <h2 className="mt-4 font-semibold text-2xl sm:text-3xl">Voices That Matter</h2>
                    <p className="inline-block mt-3 max-w-lg max-sm:text-sm text-base-content/70">
                        Hear directly from users who’ve successfully transformed their workflow with our dashboard
                        solution.
                    </p>
                </div>

                <div className="relative mt-24 w-full">
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
                        spaceBetween={20}
                        navigation={{
                            prevEl: ".testimonial-swiper-button-prev",
                            nextEl: ".testimonial-swiper-button-next",
                        }}
                        modules={[Navigation, Pagination, Autoplay]}>
                        {testimonials.map((testimonial) => (
                            <SwiperSlide
                                key={testimonial.id}
                                className="flex flex-col justify-center items-center w-full">
                                <div className="text-center">
                                    <div className="avatar">
                                        <div className="bg-base-200 w-24 mask mask-squircle">
                                            <img src={testimonial.image} alt="testimonial" />
                                        </div>
                                    </div>
                                    <p className="mt-6 font-medium text-xl">{testimonial.name}</p>
                                    <p className="text-sm text-base-content/80">{testimonial.role}</p>
                                    <div className="flex justify-center items-center mt-6">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="24"
                                            height="24"
                                            className="size-6 text-yellow-500"
                                            viewBox="0 0 24 24">
                                            <path
                                                fill="currentColor"
                                                d="m12 17.275l-4.15 2.5q-.275.175-.575.15t-.525-.2t-.35-.437t-.05-.588l1.1-4.725L3.775 10.8q-.25-.225-.312-.513t.037-.562t.3-.45t.55-.225l4.85-.425l1.875-4.45q.125-.3.388-.45t.537-.15t.537.15t.388.45l1.875 4.45l4.85.425q.35.05.55.225t.3.45t.038.563t-.313.512l-3.675 3.175l1.1 4.725q.075.325-.05.588t-.35.437t-.525.2t-.575-.15z"></path>
                                        </svg>
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="24"
                                            height="24"
                                            className="size-6 text-yellow-500"
                                            viewBox="0 0 24 24">
                                            <path
                                                fill="currentColor"
                                                d="m12 17.275l-4.15 2.5q-.275.175-.575.15t-.525-.2t-.35-.437t-.05-.588l1.1-4.725L3.775 10.8q-.25-.225-.312-.513t.037-.562t.3-.45t.55-.225l4.85-.425l1.875-4.45q.125-.3.388-.45t.537-.15t.537.15t.388.45l1.875 4.45l4.85.425q.35.05.55.225t.3.45t.038.563t-.313.512l-3.675 3.175l1.1 4.725q.075.325-.05.588t-.35.437t-.525.2t-.575-.15z"></path>
                                        </svg>
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="24"
                                            height="24"
                                            className="size-6 text-yellow-500"
                                            viewBox="0 0 24 24">
                                            <path
                                                fill="currentColor"
                                                d="m12 17.275l-4.15 2.5q-.275.175-.575.15t-.525-.2t-.35-.437t-.05-.588l1.1-4.725L3.775 10.8q-.25-.225-.312-.513t.037-.562t.3-.45t.55-.225l4.85-.425l1.875-4.45q.125-.3.388-.45t.537-.15t.537.15t.388.45l1.875 4.45l4.85.425q.35.05.55.225t.3.45t.038.563t-.313.512l-3.675 3.175l1.1 4.725q.075.325-.05.588t-.35.437t-.525.2t-.575-.15z"></path>
                                        </svg>
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="24"
                                            height="24"
                                            className="size-6 text-yellow-500"
                                            viewBox="0 0 24 24">
                                            <path
                                                fill="currentColor"
                                                d="m12 17.275l-4.15 2.5q-.275.175-.575.15t-.525-.2t-.35-.437t-.05-.588l1.1-4.725L3.775 10.8q-.25-.225-.312-.513t.037-.562t.3-.45t.55-.225l4.85-.425l1.875-4.45q.125-.3.388-.45t.537-.15t.537.15t.388.45l1.875 4.45l4.85.425q.35.05.55.225t.3.45t.038.563t-.313.512l-3.675 3.175l1.1 4.725q.075.325-.05.588t-.35.437t-.525.2t-.575-.15z"></path>
                                        </svg>
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="24"
                                            height="24"
                                            className="size-6 text-yellow-500"
                                            viewBox="0 0 24 24">
                                            <path
                                                fill="currentColor"
                                                d="m12 17.275l-4.15 2.5q-.275.175-.575.15t-.525-.2t-.35-.437t-.05-.588l1.1-4.725L3.775 10.8q-.25-.225-.312-.513t.037-.562t.3-.45t.55-.225l4.85-.425l1.875-4.45q.125-.3.388-.45t.537-.15t.537.15t.388.45l1.875 4.45l4.85.425q.35.05.55.225t.3.45t.038.563t-.313.512l-3.675 3.175l1.1 4.725q.075.325-.05.588t-.35.437t-.525.2t-.575-.15z"></path>
                                        </svg>
                                    </div>
                                    <p className="inline-block mt-6 max-w-[600px]">{testimonial.comment}</p>
                                </div>
                            </SwiperSlide>
                        ))}
                    </Swiper>
                    <div className="top-1/2 right-5 left-5 z-1 absolute flex justify-between -translate-y-1/2 transform">
                        <button
                            className="cursor-pointer btn btn-circle testimonial-swiper-button-prev"
                            aria-label="prev">
                            <Icon icon="lucide--chevron-left" className="size-4" aria-hidden />
                        </button>
                        <button
                            className="cursor-pointer btn btn-circle testimonial-swiper-button-next"
                            aria-label="next">
                            <Icon icon="lucide--chevron-right" className="size-4" aria-hidden />
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};
