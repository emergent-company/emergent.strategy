export const OrderDeliveryPartner = () => {
    return (
        <div className="flex items-center gap-3">
            <img src="/images/avatars/8.png" className="bg-base-200 mask mask-squircle size-10" alt="Avatar" />
            <div className="grow">
                <p className="text-sm font-medium">Patricia T. Gandy</p>
                <p className="text-base-content/80 text-sm">pat.gandy@mail.com</p>
            </div>
            <div className="inline-flex gap-2">
                <button className="btn btn-ghost btn-sm">
                    <span className="iconify lucide--route size-3.5" />
                    Track
                </button>
            </div>
        </div>
    );
};
