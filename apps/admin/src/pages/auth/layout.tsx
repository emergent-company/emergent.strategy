import { type ReactNode } from "react";

const AuthLayout = ({ children }: { children: ReactNode }) => {
    return (
        <div className="grid grid-cols-12 overflow-auto sm:h-screen">
            <div className="relative hidden bg-[#FFE9D1] lg:col-span-7 lg:block xl:col-span-8 2xl:col-span-9 dark:bg-[#14181c]">
                <div className="absolute inset-0 flex items-center justify-center">
                    <img src="/images/auth/auth-hero.png" className="object-cover" alt="Auth Image" />
                </div>
                <div className="animate-bounce-2 absolute right-[20%] bottom-[15%]">
                    <div className="card bg-base-100/80 w-64 backdrop-blur-lg">
                        <div className="card-body p-5">
                            <div className="flex flex-col items-center justify-center">
                                <div className="mask mask-squircle overflow-hidden">
                                    <img
                                        src="/images/landing/testimonial-avatar-1.jpg"
                                        className="bg-base-200 size-14"
                                        alt=""
                                    />
                                </div>
                                <div className="mt-3 flex items-center justify-center gap-0.5">
                                    <span className="iconify lucide--star size-4 text-orange-600" />
                                    <span className="iconify lucide--star size-4 text-orange-600" />
                                    <span className="iconify lucide--star size-4 text-orange-600" />
                                    <span className="iconify lucide--star size-4 text-orange-600" />
                                    <span className="iconify lucide--star size-4 text-orange-600" />
                                </div>
                                <p className="mt-1 text-lg font-medium">Pouya Saadeghi</p>
                                <p className="text-base-content/60 text-sm">Creator of daisyUI</p>
                            </div>
                            <p className="mt-2 text-center text-sm">
                                This is the ultimate admin dashboard for any React project
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="col-span-12 lg:col-span-5 xl:col-span-4 2xl:col-span-3">{children}</div>
        </div>
    );
};

export default AuthLayout;
