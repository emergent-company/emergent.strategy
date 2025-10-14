import React from "react";
import { Link } from "react-router";
import { Icon } from "@/components/atoms/Icon";

export default function MyProfilePage() {
    return (
        <div data-testid="page-profile" className="min-sm:container">
            <div className="text-sm breadcrumbs">
                <ul>
                    <li><Link to="/admin">Admin</Link></li>
                    <li>My Profile</li>
                </ul>
            </div>

            <div className="relative bg-primary/10 mt-4 p-6 rounded-box w-full overflow-hidden">
                <div className="flex items-center gap-2">
                    <Icon icon="lucide--id-card" className="size-5" aria-hidden />
                    <h1 className="font-medium text-xl">My Profile</h1>
                </div>
                <p className="mt-2 text-base-content/70">Manage your account information and preferences.</p>
                <Icon icon="lucide--user" className="-bottom-8 absolute size-28 text-primary/5 end-6" aria-hidden />
            </div>

            <div className="bg-base-100 mt-4 card-border card">
                <div className="gap-6 card-body">
                    <div className="gap-5 grid grid-cols-1 xl:grid-cols-5">
                        <div className="xl:col-span-2">
                            <div className="flex items-center gap-2">
                                <Icon icon="lucide--user" className="size-5" aria-hidden />
                                <p className="font-medium text-lg">User Profile</p>
                            </div>
                            <p className="text-base-content/60">Basic info</p>
                        </div>
                        <div className="xl:col-span-3">
                            <div className="gap-5 grid grid-cols-1 lg:grid-cols-2 fieldset">
                                <label className="input">
                                    <Icon icon="lucide--user" className="size-4.5 text-base-content/60" aria-hidden />
                                    <input type="text" className="grow" placeholder="Full name" defaultValue="John Doe" />
                                </label>
                                <label className="input">
                                    <Icon icon="lucide--mail" className="size-4.5 text-base-content/60" aria-hidden />
                                    <input type="email" className="grow" placeholder="Email" defaultValue="john@company.com" />
                                </label>
                                <label className="input">
                                    <Icon icon="lucide--phone" className="size-4.5 text-base-content/60" aria-hidden />
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
                            <Icon icon="lucide--x" className="size-4" aria-hidden />
                            Cancel
                        </button>
                        <button className="btn btn-sm btn-primary">
                            <Icon icon="lucide--save" className="size-4" aria-hidden />
                            Save changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
