import { IChatItem } from "./ChatItem";
import { Icon } from "@/components/atoms/Icon";

type IChatCallModal = {
    chat: IChatItem;
};

export const ChatCallModal = ({ chat }: IChatCallModal) => {
    return (
        <>
            <dialog id="apps-chat-call-modal" className="modal">
                <div className="modal-box">
                    <div className="text-center">
                        <img
                            src={chat.image}
                            className="inline bg-base-200 p-0.5 size-16 mask mask-squircle"
                            alt="avatar"
                        />
                        <p className="mt-1 font-medium">{chat.name}</p>
                        <p className="text-sm text-base-content/60">02 : 55</p>
                    </div>
                    <div className="gap-3 grid grid-cols-4 mt-8 text-center">
                        <div className="hover:bg-base-200 py-3 rounded-box max-sm:text-sm transition-all cursor-pointer">
                            <Icon icon="lucide--mic-off" className="size-6" ariaLabel="Mute" />
                            <p>Mute</p>
                        </div>
                        <div className="hover:bg-base-200 py-3 rounded-box max-sm:text-sm transition-all cursor-pointer">
                            <Icon icon="lucide--pause" className="size-6" ariaLabel="Hold" />
                            <p>Hold</p>
                        </div>
                        <div className="hover:bg-base-200 py-3 rounded-box max-sm:text-sm transition-all cursor-pointer">
                            <Icon icon="lucide--disc" className="size-6" ariaLabel="Record" />
                            <p>Record</p>
                        </div>
                        <div className="hover:bg-base-200 py-3 rounded-box max-sm:text-sm transition-all cursor-pointer">
                            <Icon icon="lucide--book-user" className="size-6" ariaLabel="Contact" />
                            <p>Contact</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 mt-8 text-center">
                        <div>
                            <button className="btn btn-circle btn-ghost btn-lg" aria-label="Add User">
                                <Icon icon="lucide--user-round-plus" className="size-6" ariaLabel="Add user" />
                            </button>
                        </div>
                        <form method="dialog">
                            <div className="mt-8">
                                <button className="btn btn-circle btn-error btn-lg" aria-label="End call">
                                    <Icon icon="lucide--phone" className="size-6 rotate-[135deg]" ariaLabel="End call" />
                                </button>
                            </div>
                        </form>
                        <div>
                            <button className="btn btn-circle btn-ghost btn-lg" aria-label="More option">
                                <Icon icon="lucide--more-horizontal" className="size-6" ariaLabel="More options" />
                            </button>
                        </div>
                    </div>
                </div>
                <form method="dialog" className="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>
        </>
    );
};
