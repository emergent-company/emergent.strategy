import { AnchorHTMLAttributes, ReactElement, ReactNode, isValidElement, Children } from "react";
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
				<span className="grow truncate">{inlineContent}</span>
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
				<span className="grow truncate">{inlineContent}</span>
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

export default SidebarMenuItem;
