// @ts-ignore
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";

import { ContentItem } from "./ContentItem";

export const GeneratedContents = () => {
    return (
        <div className="bg-base-100 card card-border">
            <div className="border-base-200 flex items-center justify-between border-b py-2.5 ps-5 pe-2.5">
                <div className="inline-flex items-center gap-3">
                    <span className="iconify lucide--file-clock size-4.5" />
                    <span>History</span>
                </div>
                <button className="btn btn-ghost btn-sm">Clear history</button>
            </div>
            <div className="card-body p-0">
                <SimpleBar className="h-[calc(100vh_-_220px)]">
                    <div className="space-y-3 p-6 pt-3">
                        <div className="text-center">
                            <div className="bg-base-200 inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs opacity-70 transition-all hover:opacity-100">
                                <span className="iconify lucide--arrow-up size-3" />
                                Older
                            </div>
                        </div>
                        <ContentItem
                            content="Can you provide an estimated timeline for completion?"
                            timeSince="Weeks ago"
                        />
                        <ContentItem
                            isResponse
                            content="Certainly! Based on our current progress, we estimate the project will be completed within 4-6 weeks. Let me know if you’d like a detailed breakdown."
                            timeSince="Week ago"
                        />
                        <ContentItem content="Can you generate a random image?" timeSince="30 minutes ago" />
                        <ContentItem
                            isResponse
                            image="/images/apps/ai/gen-10.jpg"
                            timeSince="30 minutes ago"
                            content="Here is your random image."
                        />
                        <ContentItem content="Do you have any suggestions for improvement?" timeSince="2 hours ago" />
                        <ContentItem
                            isResponse
                            content="Certainly! One suggestion would be to focus more on user feedback during the early stages of development."
                            timeSince="2 hours ago"
                        />

                        <ContentItem content="What are the next steps?" timeSince="1 minute ago" />
                        <ContentItem
                            isResponse
                            content="Next, we can schedule a meeting to discuss the implementation details. Does that work for you?"
                            timeSince="Now"
                        />
                        <ContentItem content="Follow-Up on all conversations" timeSince="now" />
                        <div className="bg-primary/5 text-primary border-primary/10 rounded-box inline border px-4 py-2">
                            <span className="loading loading-dots loading-sm"></span>
                        </div>
                    </div>
                </SimpleBar>
            </div>
        </div>
    );
};
