import { type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

const AuthLayout = ({ children }: { children: ReactNode }) => {
    return (
        <div className="grid grid-cols-12 sm:h-screen overflow-auto">
            <div className="hidden lg:block relative lg:col-span-7 2xl:col-span-9 xl:col-span-8 bg-[#FFE9D1] dark:bg-[#14181c]">
                <div className="absolute inset-0 flex justify-center items-center">
                    <img src="/images/auth/auth-hero.png" className="object-cover" alt="Auth Image" />
                </div>
                <div className="right-[20%] bottom-[15%] absolute animate-bounce-2">
                    <div className="bg-base-100/80 backdrop-blur-lg w-64 card">
                        <div className="p-5 card-body">
                            <div className="flex flex-col justify-center items-center">
                                <div className="overflow-hidden mask mask-squircle">
                                    <img
                                        src="/images/landing/testimonial-avatar-1.jpg"
                                        className="bg-base-200 size-14"
                                        alt=""
                                    />
                                </div>
                                <div className="flex justify-center items-center gap-0.5 mt-3">
                                    <Icon icon="lucide--star" className="size-4 text-orange-600" />
                                    <Icon icon="lucide--star" className="size-4 text-orange-600" />
                                    <Icon icon="lucide--star" className="size-4 text-orange-600" />
                                    <Icon icon="lucide--star" className="size-4 text-orange-600" />
                                    <Icon icon="lucide--star" className="size-4 text-orange-600" />
                                </div>
                                <p className="mt-1 font-medium text-lg">Pouya Saadeghi</p>
                                <p className="text-sm text-base-content/60">Creator of daisyUI</p>
                            </div>
                            <p className="mt-2 text-sm text-center">
                                This is the ultimate admin dashboard for any React project
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="col-span-12 lg:col-span-5 2xl:col-span-3 xl:col-span-4">{children}</div>
        </div>
    );
};

export default AuthLayout;
