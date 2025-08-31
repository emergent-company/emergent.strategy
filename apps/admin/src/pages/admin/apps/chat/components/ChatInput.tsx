import { FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";

export type IChatInput = {
    onSendMessage(message: string): void;
};

export const ChatInput = ({ onSendMessage }: IChatInput) => {
    const onSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const message = (data.get("message") as string) ?? "A new message";
        onSendMessage(message);
        e.currentTarget.reset();
    };

    return (
        <form className="flex items-center gap-3 bg-base-200 p-4" onSubmit={onSubmit}>
            <button className="btn btn-ghost btn-sm btn-circle" aria-label="Attachment" type="button">
                <Icon icon="lucide--paperclip" className="size-4.5" />
            </button>
            <input
                className="input validator grow"
                name="message"
                type="text"
                aria-label="Message"
                required
                placeholder="Type a message..."
            />
            <button className="btn btn-primary btn-circle btn-sm" type="submit" aria-label="Send message">
                <Icon icon="lucide--send-horizonal" className="size-4.5" />
            </button>
        </form>
    );
};
