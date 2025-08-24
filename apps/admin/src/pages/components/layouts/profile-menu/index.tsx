import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { AccountListMenuDemo } from "./AccountListMenuDemo";
import { DrawerMenuDemo } from "./DrawerMenuDemo";
import { MinimalMenuDemo } from "./MinimalMenuDemo";
import { NestedMenuDemo } from "./NestedMenuDemo";
import { ProfileOverlayMenuDemo } from "./ProfileOverlayMenuDemo";
import { ReferralMenuDemo } from "./ReferralMenuDemo";
import { SplitMenuDemo } from "./SplitMenuDemo";
import { SwitchAccountMenuDemo } from "./SwitchAccountMenuDemo";
import { UsageStatsMenuDemo } from "./UsageStatsMenuDemo";

const ProfileMenuPage = () => {
    return (
        <div>
            <MetaData title="Profile Menu - Layouts" />
            <ComponentPageTitle
                label="Layouts"
                title="Profile Menu"
                description="Clean profile menus with support for account switching, nested items, overlays, stats, and actions"
            />

            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:pb-16">
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Minimal</div>
                    <div className="flex items-center justify-center p-6">
                        <MinimalMenuDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Switch Account</div>
                    <div className="flex items-center justify-center p-6">
                        <SwitchAccountMenuDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Profile Overlay</div>
                    <div className="flex items-center justify-center p-6">
                        <ProfileOverlayMenuDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Referral</div>
                    <div className="flex items-center justify-center p-6">
                        <ReferralMenuDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Account List</div>
                    <div className="flex items-center justify-center p-6">
                        <AccountListMenuDemo />
                    </div>
                </div>

                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Nested</div>
                    <div className="flex items-center justify-center p-6">
                        <NestedMenuDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Split</div>
                    <div className="flex items-center justify-center p-6">
                        <SplitMenuDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Usage Stats</div>
                    <div className="flex items-center justify-center p-6">
                        <UsageStatsMenuDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Drawer</div>
                    <div className="flex items-center justify-center p-6">
                        <DrawerMenuDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileMenuPage;
