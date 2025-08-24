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
        <section id="testimonial" className="relative container py-8 md:py-12 xl:py-16 2xl:py-24">
            <div className="absolute inset-0 bg-[url('/images/landing/testimonial-background.svg')] bg-cover bg-center bg-no-repeat opacity-8 dark:opacity-6"></div>

            <div className="relative">
                <div className="text-center">
                    <div className="rounded-box inline-flex items-center border border-orange-500/10 bg-orange-500/5 p-2">
                        <span className="iconify lucide--sparkles size-5 text-orange-600" />
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">Voices That Matter</h2>
                    <p className="text-base-content/70 mt-3 inline-block max-w-lg max-sm:text-sm">
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
                                className="flex w-full flex-col items-center justify-center">
                                <div className="text-center">
                                    <div className="avatar">
                                        <div className="mask mask-squircle bg-base-200 w-24">
                                            <img src={testimonial.image} alt="testimonial" />
                                        </div>
                                    </div>
                                    <p className="mt-6 text-xl font-medium">{testimonial.name}</p>
                                    <p className="text-base-content/80 text-sm">{testimonial.role}</p>
                                    <div className="mt-6 flex items-center justify-center">
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
                                    <p className="mt-6 inline-block max-w-[600px]">{testimonial.comment}</p>
                                </div>
                            </SwiperSlide>
                        ))}
                    </Swiper>
                    <div className="absolute top-1/2 right-5 left-5 z-1 flex -translate-y-1/2 transform justify-between">
                        <button
                            className="btn btn-circle testimonial-swiper-button-prev cursor-pointer"
                            aria-label="prev">
                            <span className="iconify lucide--chevron-left size-4" />
                        </button>
                        <button
                            className="btn btn-circle testimonial-swiper-button-next cursor-pointer"
                            aria-label="next">
                            <span className="iconify lucide--chevron-right size-4" />
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};
