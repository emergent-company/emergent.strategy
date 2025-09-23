import { Link } from "react-router";
import { Icon } from "@/components/atoms/Icon";

export const FAQ = () => {
    return (
        <div className="py-8 md:py-12 2xl:py-24 xl:py-16 container" id="faqs">
            <div className="gap-12 lg:gap-24 grid grid-cols-1 lg:grid-cols-7">
                <div className="flex flex-col max-sm:items-center col-span-1 lg:col-span-3 max-sm:text-center">
                    <div className="inline-flex items-center bg-purple-500/5 p-2 border border-purple-500/10 rounded-box w-fit">
                        <Icon icon="lucide--messages-square" className="size-5 text-purple-600" ariaLabel="Support" />
                    </div>
                    <p className="mt-4 font-semibold text-2xl sm:text-3xl">Support Center</p>
                    <p className="inline-block mt-3 max-w-lg max-sm:text-sm text-base-content/70">
                        If you still have questions, don’t hesitate to reach out. Contact us anytime for quick
                        assistance.
                    </p>
                    <Link className="mt-4 w-fit btn btn-sm" target="_blank" to="https://discord.com/invite/S6TZxycVHs">
                        Contact Us
                    </Link>
                </div>
                <div className="lg:col-span-4">
                    <div className="space-y-0">
                        <div className="collapse collapse-plus border-base-300">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                                <div className="flex items-center gap-4 ite">
                                    <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                                        <Icon icon="lucide--messages-square" className="size-4.5" ariaLabel="Messages" />
                                    </div>
                                    How can i give a feedback?
                                </div>
                            </div>
                            <div className="collapse-content ms-12">
                                <p>
                                    You can provide feedback by filling out our
                                    <Link
                                        className="ms-1 text-primary"
                                        target="_blank"
                                        to="https://forms.gle/UeX3jgsjFNFcZsq9A">
                                        Google Form
                                    </Link>
                                </p>
                            </div>
                        </div>
                        <div className="collapse collapse-plus border-base-300">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                                <div className="flex items-center gap-4 ite">
                                    <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                                        <Icon icon="lucide--code" className="size-4.5" ariaLabel="Code" />
                                    </div>
                                    Can i get full source code?
                                </div>
                            </div>
                            <div className="collapse-content ms-12">
                                <p>
                                    Certainly, we offer the complete source code depending on the package you've
                                    purchased. You might look into depth:
                                    <Link
                                        className="ms-1 text-primary"
                                        target="_blank"
                                        to="https://nexus.daisyui.com/docs/">
                                        Packages
                                    </Link>
                                </p>
                            </div>
                        </div>
                        <div className="collapse collapse-plus border-base-300">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                                <div className="flex items-center gap-4 ite">
                                    <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                                        <Icon icon="lucide--credit-card" className="size-4.5" ariaLabel="Payments" />
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
                        <div className="collapse collapse-plus border-base-300">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                                <div className="flex items-center gap-4 ite">
                                    <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                                        <Icon icon="lucide--repeat" className="size-4.5" ariaLabel="Updates" />
                                    </div>
                                    Are there plans for future updates, and will they incur any costs?
                                </div>
                            </div>
                            <div className="collapse-content ms-12">
                                <p>
                                    All future updates are completely free. No payment is required for any upcoming
                                    updates. Yes, there are many plans for future updates. You can checkout
                                    <Link
                                        className="ms-1 text-primary"
                                        target="_blank"
                                        to="https://nexus.daisyui.com/docs/">
                                        future roadmap
                                    </Link>
                                </p>
                            </div>
                        </div>
                        <div className="collapse collapse-plus border-base-300">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                                <div className="flex items-center gap-4 ite">
                                    <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                                        <Icon icon="lucide--server" className="size-4.5" ariaLabel="Server" />
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
                        <div className="collapse collapse-plus border-base-300">
                            <input type="radio" aria-label="Accordion radio" name="accordion" />
                            <div className="collapse-title font-medium sm:text-xl cursor-pointer">
                                <div className="flex items-center gap-4 ite">
                                    <div className="inline-flex justify-center items-center p-1.5 border border-base-300 rounded-box">
                                        <Icon icon="lucide--telescope" className="size-4.5" ariaLabel="Roadmap" />
                                    </div>
                                    Is there any updates in the future?
                                </div>
                            </div>
                            <div className="collapse-content ms-12">
                                <p>
                                    Yes, Our team constantly improves the admin template based on user feedback and
                                    industry trends.
                                    <Link
                                        className="ms-1 text-primary"
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
