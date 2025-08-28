import React from "react";
import { Link } from "react-router";

export default function MyProfilePage() {
    return (
        <div className="min-sm:container">
            <div className="text-sm breadcrumbs">
                <ul>
                    <li><Link to="/admin">Admin</Link></li>
                    <li>My Profile</li>
                </ul>
            </div>

            <div className="relative bg-primary/10 mt-4 p-6 rounded-box w-full overflow-hidden">
                <div className="flex items-center gap-2">
                    <span className="size-5 iconify lucide--id-card" />
                    <h1 className="font-medium text-xl">My Profile</h1>
                </div>
                <p className="mt-2 text-base-content/70">Manage your account information and preferences.</p>
                <span className="-bottom-8 absolute size-28 text-primary/5 iconify lucide--user end-6" />
            </div>

            <div className="bg-base-100 mt-4 card-border card">
                <div className="gap-6 card-body">
                    <div className="gap-5 grid grid-cols-1 xl:grid-cols-5">
                        <div className="xl:col-span-2">
                            <div className="flex items-center gap-2">
                                <span className="size-5 iconify lucide--user" />
                                <p className="font-medium text-lg">User Profile</p>
                            </div>
                            <p className="text-base-content/60">Basic info</p>
                        </div>
                        <div className="xl:col-span-3">
                            <div className="gap-5 grid grid-cols-1 lg:grid-cols-2 fieldset">
                                <label className="input">
                                    <span className="size-4.5 text-base-content/60 iconify lucide--user"></span>
                                    <input type="text" className="grow" placeholder="Full name" defaultValue="John Doe" />
                                </label>
                                <label className="input">
                                    <span className="size-4.5 text-base-content/60 iconify lucide--mail"></span>
                                    <input type="email" className="grow" placeholder="Email" defaultValue="john@company.com" />
                                </label>
                                <label className="input">
                                    <span className="size-4.5 text-base-content/60 iconify lucide--phone"></span>
                                    <input type="tel" className="grow" placeholder="Phone" defaultValue="(+123) 9876543210" />
                                </label>
                                <label className="input">
                                    <span className="label">nexus.com/</span>
                                    <input type="text" className="grow" placeholder="username" defaultValue="johndoe" />
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-2">
                        <button className="btn btn-sm btn-ghost">
                            <span className="size-4 iconify lucide--x" />
                            Cancel
                        </button>
                        <button className="btn btn-sm btn-primary">
                            <span className="size-4 iconify lucide--save" />
                            Save changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
