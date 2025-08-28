import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { BrandingFooterDemo } from "./BrandingFooterDemo";
import { CustomBackgroundFooterDemo } from "./CustomBackgroundFooterDemo";
import { LegalFooterDemo } from "./LegalFooterDemo";
import { MinimalFooterDemo } from "./MinimalFooterDemo";
import { Options1FooterDemo } from "./Options1FooterDemo";
import { Options2FooterDemo } from "./Options2FooterDemo";
import { SocialFooterDemo } from "./SocialFooterDemo";
import { StatusFooterDemo } from "./StatusFooterDemo";
import { SupportFooterDemo } from "./SupportFooterDemo  ";

const FooterPage = () => {
    return (
        <div>
            <MetaData title="Footer - Layouts" />
            <ComponentPageTitle
                label="Layouts"
                title="Footer"
                description="Footer demos showcase minimal, social, branding, legal, status, support, and customizable layouts."
            />

            <div className="flex items-center gap-3 bg-base-200/40 mt-6 lg:mt-12 px-5 py-4 rounded-box">
                <span className="size-4.5 text-base-content/70 iconify lucide--info"></span>
                <p>
                    <span className="me-1">Play with layouts using</span>
                    <Link to="/admin/tools/layout-builder" target="_blank" className="text-primary">
                        Layout Builder
                    </Link>
                </p>
            </div>

            <p className="mt-6 font-medium text-base-content/60">Demos</p>

            <div className="space-y-8 mt-6">
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Minimal</div>
                    <div className="py-2">
                        <MinimalFooterDemo />
                    </div>
                </div>
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Social</div>
                    <div className="py-2">
                        <SocialFooterDemo />
                    </div>
                </div>
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Branding</div>
                    <div className="py-2">
                        <BrandingFooterDemo />
                    </div>
                </div>
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Legal</div>
                    <div className="py-2">
                        <LegalFooterDemo />
                    </div>
                </div>
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Status</div>
                    <div className="py-2">
                        <StatusFooterDemo />
                    </div>
                </div>

                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Support</div>
                    <div className="py-2">
                        <SupportFooterDemo />
                    </div>
                </div>

                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Options 1</div>
                    <div className="py-2">
                        <Options1FooterDemo />
                    </div>
                </div>
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Options 2</div>
                    <div className="py-2">
                        <Options2FooterDemo />
                    </div>
                </div>
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Custom Background</div>
                    <CustomBackgroundFooterDemo />
                </div>
            </div>
        </div>
    );
};

export default FooterPage;
