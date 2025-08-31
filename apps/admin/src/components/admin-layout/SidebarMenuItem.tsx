import { AnchorHTMLAttributes } from "react";
import { Link } from "react-router";

import { ISidebarMenuItemBadges, SidebarMenuItemBadges } from "./SidebarMenuItemBadges";
import { Icon } from "@/components/ui/Icon";

export type ISidebarMenuItem = {
    id: string;
    icon?: string;
    label: string;
    isTitle?: boolean;
    url?: string;
    linkProp?: AnchorHTMLAttributes<HTMLAnchorElement>;
    children?: ISidebarMenuItem[];
} & ISidebarMenuItemBadges;

export const SidebarMenuItem = ({
    id,
    url,
    children,
    icon,
    isTitle,
    badges,
    linkProp,
    label,
    activated,
    onToggleActivated,
}: ISidebarMenuItem & { activated: Set<string>; onToggleActivated?: (key: string) => void }) => {
    const selected = activated.has(id);

    if (isTitle) {
        return <p className="px-2.5 pt-3 first:pt-0 pb-1.5 menu-label">{label}</p>;
    }

    if (!children) {
        return (
            <Link to={url ?? ""} className={`menu-item ${selected && "active"}`} {...linkProp}>
                {icon && <Icon icon={icon} className="size-4" />}
                <span className="grow">{label}</span>
                <SidebarMenuItemBadges badges={badges} />
            </Link>
        );
    }

    return (
        <div className="group collapse">
            <input
                aria-label="Sidemenu item trigger"
                type="checkbox"
                name="sidebar-menu-parent-item"
                checked={selected}
                onChange={() => onToggleActivated?.(id)}
                className="peer"
            />
            <div className="collapse-title px-2.5 py-1.5">
                {icon && <Icon icon={icon} className="size-4" />}
                <span className="grow">{label}</span>
                <SidebarMenuItemBadges badges={badges} />
                <Icon icon="lucide--chevron-right" className="size-3.5 arrow-icon" />
            </div>
            <div className="collapse-content ms-6.5 !p-0">
                <div className="space-y-0.5 mt-0.5">
                    {children.map((item, index) => (
                        <SidebarMenuItem
                            {...item}
                            key={index}
                            activated={activated}
                            onToggleActivated={onToggleActivated}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};
