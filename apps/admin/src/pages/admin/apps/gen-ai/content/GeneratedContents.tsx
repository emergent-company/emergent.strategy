// @ts-ignore
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";
import { Icon } from "@/components/ui/Icon";

import { ContentItem } from "./ContentItem";

export const GeneratedContents = () => {
    return (
        <div className="bg-base-100 card-border card">
            <div className="flex justify-between items-center py-2.5 ps-5 pe-2.5 border-b border-base-200">
                <div className="inline-flex items-center gap-3">
                    <Icon icon="lucide--file-clock" className="size-4.5" />
                    <span>History</span>
                </div>
                <button className="btn btn-ghost btn-sm">Clear history</button>
            </div>
            <div className="p-0 card-body">
                <SimpleBar className="h-[calc(100vh_-_220px)]">
                    <div className="space-y-3 p-6 pt-3">
                        <div className="text-center">
                            <div className="inline-flex items-center gap-1 bg-base-200 opacity-70 hover:opacity-100 px-3 py-1 rounded-full text-xs transition-all cursor-pointer">
                                <Icon icon="lucide--arrow-up" className="size-3" />
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
                        <div className="inline bg-primary/5 px-4 py-2 border border-primary/10 rounded-box text-primary">
                            <span className="loading loading-dots loading-sm"></span>
                        </div>
                    </div>
                </SimpleBar>
            </div>
        </div>
    );
};
