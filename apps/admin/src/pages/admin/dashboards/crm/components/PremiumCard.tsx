export const PremiumCard = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body">
                <p className="text-base-content/60 text-xs italic">Upgrade to premium</p>
                <p className="mt-1 leading-tight">Make the better business analytics with Premium Dashboard</p>
                <div className="mt-2 flex items-end justify-between">
                    <div className="avatar-group -space-x-3.5">
                        <div className="avatar">
                            <div className="bg-base-200 w-7 rounded-full">
                                <img alt="Avatar" src="/images/avatars/4.png" />
                            </div>
                        </div>
                        <div className="avatar">
                            <div className="bg-base-200 w-7 rounded-full">
                                <img alt="Avatar" src="/images/avatars/5.png" />
                            </div>
                        </div>
                        <div className="avatar">
                            <div className="bg-base-200 w-7 rounded-full">
                                <img alt="Avatar" src="/images/avatars/7.png" />
                            </div>
                        </div>
                        <div className="avatar">
                            <div className="bg-base-200 w-7 rounded-full">
                                <img alt="Avatar" src="/images/avatars/8.png" />
                            </div>
                        </div>
                    </div>
                    <button className="btn btn-sm btn-outline btn-neutral">Pay Monthly $29</button>
                </div>
            </div>
        </div>
    );
};
