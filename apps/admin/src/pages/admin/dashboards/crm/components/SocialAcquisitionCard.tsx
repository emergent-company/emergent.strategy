import { SocialAcquisitionChart } from "./SocialAcquisitionChart";

export const SocialAcquisitionCard = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body px-0 pb-0">
                <div className="flex items-center gap-2 px-5">
                    <span className="iconify lucide--megaphone text-base-content/80 size-4.5" />
                    <span className="grow font-medium">Social Acquisition</span>
                    <div className="hidden items-center gap-1 sm:inline-flex">
                        <span className="me-1 text-sm">0</span>
                        <div className="bg-primary/20 rounded-box size-2.5"></div>
                        <div className="bg-primary/40 rounded-box size-2.5"></div>
                        <div className="bg-primary/60 rounded-box size-2.5"></div>
                        <div className="bg-primary/80 rounded-box size-2.5"></div>
                        <div className="bg-primary rounded-box size-2.5"></div>
                        <span className="ms-1 text-sm">100</span>
                    </div>
                </div>
                <div className="mt-2">
                    <SocialAcquisitionChart />
                </div>
            </div>
        </div>
    );
};
