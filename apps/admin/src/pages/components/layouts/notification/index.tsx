import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { BasicNotificationDemo } from "./BasicNotificationDemo";
import { DrawerNotificationDemo } from "./DrawerNotificationDemo";
import { TabNotificationDemo } from "./TabNotificationDemo";

const NotificationPage = () => {
    return (
        <div>
            <MetaData title="Notification - Layouts" />
            <ComponentPageTitle
                label="Layouts"
                title="Notification"
                description="Simple, clean notifications with tabs, drawers, and basic styles to suit any modern interface"
            />
            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Basic</div>
                    <div className="flex items-center justify-center p-6">
                        <BasicNotificationDemo />
                    </div>
                </div>
                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Tab</div>
                    <div className="flex items-center justify-center p-6">
                        <TabNotificationDemo />
                    </div>
                </div>
                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Drawer</div>
                    <div className="flex items-center justify-center p-6">
                        <DrawerNotificationDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NotificationPage;
