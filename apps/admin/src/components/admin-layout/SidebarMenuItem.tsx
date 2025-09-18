import { AnchorHTMLAttributes, ReactElement, ReactNode, isValidElement, Children } from "react";
/**
 * Migration Notes (Config -> Composition):
 *
 * Previous usage for nested items:
 * (Deprecated old config form – removed) <SidebarMenuItem id="reports" label="Reports" icon="lucide--bar-chart-3" children={[{ id: 'r-daily', label: 'Daily', url: '/daily' }]} />
 *
 * New compositional pattern:
 * New compositional pattern (no label prop; text content is child JSX):
 * <SidebarMenuItem id="reports" icon="lucide--bar-chart-3" collapsible>
 *   Reports
 *   <SidebarMenuItem id="r-daily" url="/daily">Daily</SidebarMenuItem>
 *   <SidebarMenuItem id="r-monthly" url="/monthly">Monthly</SidebarMenuItem>
 * </SidebarMenuItem>
 *
 * The legacy `children` config array remains temporarily supported but will be removed.
 * Prefer the `<SidebarMenuItemComposable />` wrapper + `collapsible` prop for nesting.
 */
import { Link } from "react-router";

import { ISidebarMenuItemBadges, SidebarMenuItemBadges } from "./SidebarMenuItemBadges";
import { Icon } from "@/components/ui/Icon";

export type ISidebarMenuItem = {
    id: string;
    icon?: string;
    url?: string;
    linkProp?: AnchorHTMLAttributes<HTMLAnchorElement>;
} & ISidebarMenuItemBadges;

type SidebarMenuItemExtraProps = {
    collapsible?: boolean;
    children?: ReactNode; // Visible content + potential nested SidebarMenuItem nodes
};

export const SidebarMenuItem = ({
    id,
    url,
    icon,
    badges,
    linkProp,
    activated,
    onToggleActivated,
    collapsible,
    children,
}: ISidebarMenuItem & SidebarMenuItemExtraProps & { activated?: Set<string>; onToggleActivated?: (key: string) => void }) => {
    const activeSet = activated || new Set<string>();
    const selected = activeSet.has(id);

    // Split visible text/content from nested items
    const nestedChildren: ReactElement[] = [];
    const inlineContent: ReactNode[] = [];
    Children.forEach(children, (child) => {
        if (isValidElement(child) && child.type === SidebarMenuItem) {
            nestedChildren.push(child as ReactElement);
        } else if (child !== null && child !== undefined) {
            inlineContent.push(child as ReactNode);
        }
    });

    const hasNested = nestedChildren.length > 0;
    const isCollapsible = collapsible || hasNested;

    if (!isCollapsible) {
        return (
            <Link to={url ?? ""} className={`menu-item ${selected && "active"}`} {...linkProp}>
                {icon && <Icon icon={icon} className="size-4" />}
                <span className="truncate grow">{inlineContent}</span>
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
                <span className="truncate grow">{inlineContent}</span>
                <SidebarMenuItemBadges badges={badges} />
                <Icon icon="lucide--chevron-right" className="size-3.5 arrow-icon" />
            </div>
            <div className="collapse-content ms-6.5 !p-0">
                <div className="space-y-0.5 mt-0.5">
                    {nestedChildren.map((child) =>
                        isValidElement(child) ? (
                            <SidebarMenuItem
                                key={(child.props as any).id}
                                {...(child.props as any)}
                                activated={activeSet}
                                onToggleActivated={onToggleActivated}
                            />
                        ) : (
                            child
                        ),
                    )}
                </div>
            </div>
        </div>
    );
};
