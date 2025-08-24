import { IChatItem } from "./ChatItem";

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
                            className="bg-base-200 mask mask-squircle inline size-16 p-0.5"
                            alt="avatar"
                        />
                        <p className="mt-1 font-medium">{chat.name}</p>
                        <p className="text-base-content/60 text-sm">02 : 55</p>
                    </div>
                    <div className="mt-8 grid grid-cols-4 gap-3 text-center">
                        <div className="hover:bg-base-200 rounded-box cursor-pointer py-3 transition-all max-sm:text-sm">
                            <span className="iconify lucide--mic-off size-6"></span>
                            <p>Mute</p>
                        </div>
                        <div className="hover:bg-base-200 rounded-box cursor-pointer py-3 transition-all max-sm:text-sm">
                            <span className="iconify lucide--pause size-6"></span>
                            <p>Hold</p>
                        </div>
                        <div className="hover:bg-base-200 rounded-box cursor-pointer py-3 transition-all max-sm:text-sm">
                            <span className="iconify lucide--disc size-6"></span>
                            <p>Record</p>
                        </div>
                        <div className="hover:bg-base-200 rounded-box cursor-pointer py-3 transition-all max-sm:text-sm">
                            <span className="iconify lucide--book-user size-6"></span>
                            <p>Contact</p>
                        </div>
                    </div>
                    <div className="mt-8 grid grid-cols-3 text-center">
                        <div>
                            <button className="btn btn-circle btn-ghost btn-lg" aria-label="Add User">
                                <span className="iconify lucide--user-round-plus size-6"></span>
                            </button>
                        </div>
                        <form method="dialog">
                            <div className="mt-8">
                                <button className="btn btn-circle btn-error btn-lg" aria-label="End call">
                                    <span className="iconify lucide--phone size-6 rotate-[135deg]"></span>
                                </button>
                            </div>
                        </form>
                        <div>
                            <button className="btn btn-circle btn-ghost btn-lg" aria-label="More option">
                                <span className="iconify lucide--more-horizontal size-6"></span>
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
