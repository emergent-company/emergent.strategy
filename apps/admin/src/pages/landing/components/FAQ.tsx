import { Link } from "react-router";

export const FAQ = () => {
    return (
        <div className="container py-8 md:py-12 xl:py-16 2xl:py-24" id="faqs">
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-7 lg:gap-24">
                <div className="col-span-1 flex flex-col max-sm:items-center max-sm:text-center lg:col-span-3">
                    <div className="rounded-box inline-flex w-fit items-center border border-purple-500/10 bg-purple-500/5 p-2">
                        <span className="iconify lucide--messages-square size-5 text-purple-600" />
                    </div>
                    <p className="mt-4 text-2xl font-semibold sm:text-3xl">Support Center</p>
                    <p className="text-base-content/70 mt-3 inline-block max-w-lg max-sm:text-sm">
                        If you still have questions, don’t hesitate to reach out. Contact us anytime for quick
                        assistance.
                    </p>
                    <Link className="btn btn-sm mt-4 w-fit" target="_blank" to="https://discord.com/invite/S6TZxycVHs">
                        Contact Us
                    </Link>
                </div>
                <div className="lg:col-span-4">
                    <div className="space-y-0">
                        <div className="collapse-plus border-base-300 collapse">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title cursor-pointer font-medium sm:text-xl">
                                <div className="ite flex items-center gap-4">
                                    <div className="border-base-300 rounded-box inline-flex items-center justify-center border p-1.5">
                                        <span className="iconify lucide--messages-square size-4.5" />
                                    </div>
                                    How can i give a feedback?
                                </div>
                            </div>
                            <div className="collapse-content ms-12">
                                <p>
                                    You can provide feedback by filling out our
                                    <Link
                                        className="text-primary ms-1"
                                        target="_blank"
                                        to="https://forms.gle/UeX3jgsjFNFcZsq9A">
                                        Google Form
                                    </Link>
                                </p>
                            </div>
                        </div>
                        <div className="collapse-plus border-base-300 collapse">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title cursor-pointer font-medium sm:text-xl">
                                <div className="ite flex items-center gap-4">
                                    <div className="border-base-300 rounded-box inline-flex items-center justify-center border p-1.5">
                                        <span className="iconify lucide--code size-4.5" />
                                    </div>
                                    Can i get full source code?
                                </div>
                            </div>
                            <div className="collapse-content ms-12">
                                <p>
                                    Certainly, we offer the complete source code depending on the package you've
                                    purchased. You might look into depth:
                                    <Link
                                        className="text-primary ms-1"
                                        target="_blank"
                                        to="https://nexus.daisyui.com/docs/">
                                        Packages
                                    </Link>
                                </p>
                            </div>
                        </div>
                        <div className="collapse-plus border-base-300 collapse">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title cursor-pointer font-medium sm:text-xl">
                                <div className="ite flex items-center gap-4">
                                    <div className="border-base-300 rounded-box inline-flex items-center justify-center border p-1.5">
                                        <span className="iconify lucide--credit-card size-4.5" />
                                    </div>
                                    Will there be any future payments required?
                                </div>
                            </div>
                            <div className="collapse-content ms-12">
                                <p>
                                    Absolutely not. It's a one-time purchase, with no hidden charges or future payments
                                    to worry about.
                                </p>
                            </div>
                        </div>
                        <div className="collapse-plus border-base-300 collapse">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title cursor-pointer font-medium sm:text-xl">
                                <div className="ite flex items-center gap-4">
                                    <div className="border-base-300 rounded-box inline-flex items-center justify-center border p-1.5">
                                        <span className="iconify lucide--repeat size-4.5" />
                                    </div>
                                    Are there plans for future updates, and will they incur any costs?
                                </div>
                            </div>
                            <div className="collapse-content ms-12">
                                <p>
                                    All future updates are completely free. No payment is required for any upcoming
                                    updates. Yes, there are many plans for future updates. You can checkout
                                    <Link
                                        className="text-primary ms-1"
                                        target="_blank"
                                        to="https://nexus.daisyui.com/docs/">
                                        future roadmap
                                    </Link>
                                </p>
                            </div>
                        </div>
                        <div className="collapse-plus border-base-300 collapse">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title cursor-pointer font-medium sm:text-xl">
                                <div className="ite flex items-center gap-4">
                                    <div className="border-base-300 rounded-box inline-flex items-center justify-center border p-1.5">
                                        <span className="iconify lucide--server size-4.5" />
                                    </div>
                                    Do I need a backend for this?
                                </div>
                            </div>
                            <div className="collapse-content ms-12">
                                <p>
                                    No backend is required to run this UI template. However, you can integrate any type
                                    of backend as needed.
                                </p>
                            </div>
                        </div>
                        <div className="collapse-plus border-base-300 collapse">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title cursor-pointer font-medium sm:text-xl">
                                <div className="ite flex items-center gap-4">
                                    <div className="border-base-300 rounded-box inline-flex items-center justify-center border p-1.5">
                                        <span className="iconify lucide--telescope size-4.5" />
                                    </div>
                                    Is there any updates in the future?
                                </div>
                            </div>
                            <div className="collapse-content ms-12">
                                <p>
                                    Yes, Our team constantly improves the admin template based on user feedback and
                                    industry trends.
                                    <Link
                                        className="text-primary ms-1"
                                        target="_blank"
                                        to="https://nexus.daisyui.com/docs/">
                                        You can see product roadmap
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
