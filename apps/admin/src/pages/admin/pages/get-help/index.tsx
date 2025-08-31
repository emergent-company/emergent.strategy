import React from "react";
import { Icon } from "@/components/ui/Icon";

import { HelpTopic } from "./HelpTopic";
import { getSystemFAQs, getUserManagementFAQs, helpTopics } from "./helpers";

const GetHelpPage = () => {
    return (
        <>
            <div className="min-sm:container">
                <div className="relative bg-primary/10 p-6 rounded-box w-full overflow-hidden">
                    <div className="flex justify-between">
                        <div>
                            <div className="flex items-center gap-1">
                                <p className="text-sm text-base-content/80">Pages</p>
                                <Icon icon="lucide--chevron-right" className="size-3.5 text-base-content/80" aria-hidden />
                                <p className="text-sm">Support</p>
                            </div>
                            <p className="mt-4 font-medium text-primary text-xl">Get Help</p>
                            <p className="text-base-content/80">
                                Find answers to common questions and learn how to use the platform effectively
                            </p>
                        </div>
                        <div className="flex flex-col justify-between items-end">
                            <button className="btn btn-sm btn-primary max-xl:btn-square">
                                <Icon icon="lucide--plus" className="size-4" aria-hidden />
                                <span className="max-xl:hidden">Create a Ticket</span>
                            </button>
                            <div className="max-xl:hidden flex items-center gap-2 text-base-content/60">
                                <Icon icon="lucide--ticket-check" className="size-4" aria-hidden />
                                <p className="text-sm">Your last ticket has been resolved</p>
                            </div>
                        </div>
                    </div>
                    <Icon icon="lucide--badge-help" className="-bottom-12 absolute size-44 text-primary/5 -rotate-25 start-1/2" aria-hidden />
                </div>
                <div className="gap-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mt-6">
                    {helpTopics.map((topic, i) => (
                        <HelpTopic {...topic} key={i} />
                    ))}
                </div>
                <p className="mt-12 font-medium text-2xl text-center">Frequently Asked Questions</p>
                <p className="text-base-content/80 text-center">
                    Find answers to common questions about system features, settings, and troubleshooting.
                </p>
                <div className="gap-8 grid md:grid-cols-2 mt-8">
                    <div className="bg-base-100 shadow h-fit card">
                        <div className="pb-0 card-body">
                            <div className="badge badge-sm badge-ghost">Control</div>
                            <p className="font-medium text-lg">User Management queries</p>
                            <div className="-mx-4 mt-2">
                                {getUserManagementFAQs.map((faq, i) => (
                                    <div className="collapse collapse-plus" key={i}>
                                        <input
                                            type="radio"
                                            aria-label="Accordion radio"
                                            className="cursor-pointer"
                                            name="accordion"
                                        />
                                        <div className="collapse-title cursor-pointer">{faq.question}</div>
                                        <div className="collapse-content">{faq.answer}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="bg-base-100 shadow h-fit card">
                        <div className="pb-0 card-body">
                            <div className="badge badge-sm badge-ghost">Platform</div>
                            <p className="font-medium text-lg">System related queries</p>
                            <div className="-mx-4 mt-2">
                                {getSystemFAQs.map((faq, i) => (
                                    <div className="collapse collapse-plus" key={i}>
                                        <input
                                            type="radio"
                                            aria-label="Accordion radio"
                                            className="cursor-pointer"
                                            name="accordion"
                                        />
                                        <div className="collapse-title cursor-pointer">{faq.question}</div>
                                        <div className="collapse-content">{faq.answer}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default GetHelpPage;
