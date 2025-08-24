import { Link } from "react-router";

export const ReferralMenuDemo = () => {
    return (
        <div className="dropdown dropdown-bottom sm:dropdown-end max-sm:dropdown-center">
            <div tabIndex={0} className="flex cursor-pointer items-center gap-3">
                <div className="avatar bg-base-200 size-12 overflow-hidden rounded-full px-1 pt-1">
                    <img src="/images/avatars/4.png" alt="Avatar" />
                </div>
                <div>
                    <p className="font-medium">Olivia Carter</p>
                    <p className="text-base-content/70 -mt-1 text-sm">olivia.carter@mail.com</p>
                </div>
            </div>

            <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-2 w-60 shadow">
                <div className="hover:bg-base-200/30 rounded-t-box flex cursor-pointer items-start gap-3 px-4 py-2.5">
                    <div className="avatar bg-base-200 size-10 overflow-hidden rounded-full px-1 pt-1">
                        <img src="/images/avatars/4.png" alt="Avatar" />
                    </div>
                    <div className="grow">
                        <p className="font-medium">Olivia Carter</p>
                        <p className="text-base-content/70 text-sm/none">olivia.carter@mail.com</p>
                    </div>
                </div>

                <hr className="border-base-200" />

                <ul className="menu w-full p-2">
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--users size-4.5" />
                            <span>My Referrals</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--dollar-sign size-4.5" />
                            <span>Referral Rewards</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--clock size-4.5" />
                            <span>Pending Invitations</span>
                        </Link>
                    </li>
                </ul>
                <hr className="border-base-200" />

                <div className="from-primary/3 hover:from-primary/5 flex cursor-pointer items-center gap-3 bg-linear-to-r to-transparent px-4 py-3 transition-all">
                    <span className="iconify lucide--gift size-6"></span>
                    <div className="grow">
                        <p className="font-medium">Refer a friend</p>
                        <p className="text-base-content/70 text-sm/none">5 invites waiting</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
