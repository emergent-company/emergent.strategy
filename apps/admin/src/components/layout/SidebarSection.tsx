import { ISidebarMenuItem, SidebarMenuItem } from "./SidebarMenuItem";
import { getActivatedItemParentKeys } from "./helpers";
import { useLocation } from "react-router";
import { useEffect, useState, useMemo } from "react";

export interface ISidebarSectionProps {
	id?: string;
	/** Optional title rendered as a non-clickable label at top */
	title?: string;
	/** Child SidebarMenuItem components */
	children: React.ReactNode;
	/** External activated set passed from parent sidebar to preserve expansion state */
	activated?: Set<string>;
	/** Callback when parent item toggled */
	onToggleActivated?: (key: string) => void;
	/** Optional className to wrap the list */
	className?: string;
}

/**
 * SidebarSection groups a list of navigation items with optional heading.
 * Keeps styling parity with main Sidebar container's item list spacing.
 */
export const SidebarSection = ({
	id,
	title,
	children,
	activated,
	onToggleActivated,
	className = "",
}: ISidebarSectionProps) => {
	const { pathname } = useLocation();
	const [localActivated, setLocalActivated] = useState<Set<string>>(activated || new Set());

	// Normalize children into an array and extract ISidebarMenuItem definitions from SidebarMenuItem elements
	const arrayChildren = useMemo(() => (Array.isArray(children) ? children : [children]), [children]);
	const items: ISidebarMenuItem[] = useMemo(() => {
		const acc: ISidebarMenuItem[] = [];
		arrayChildren.forEach((child: any) => {
			if (child && child.type === SidebarMenuItem) {
				const { activated: _a, onToggleActivated: _b, children: _c, collapsible: _d, ...rest } = child.props || {};
				acc.push(rest as ISidebarMenuItem);
			}
		});
		return acc;
	}, [arrayChildren]);

	// If parent does not manage activation, auto-derive based on current path.
	useEffect(() => {
		if (!activated) {
			setLocalActivated(getActivatedItemParentKeys(items, pathname));
		}
	}, [items, pathname, activated]);

	const activeSet = activated || localActivated;

	const handleToggle = (key: string) => {
		if (onToggleActivated) {
			onToggleActivated(key);
			return;
		}
		const next = new Set(activeSet);
		if (next.has(key)) next.delete(key); else next.add(key);
		setLocalActivated(next);
	};

	return (
		<div id={id} className={className}>
			{title && (
				<div className="px-3 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-base-content/50">
					{title}
				</div>
			)}
			<div className="space-y-0.5 px-2.5">
				{arrayChildren.map((child, idx) => {
					if (child && (child as any).type === SidebarMenuItem) {
						return (
							<SidebarMenuItem
								key={(child as any).key || (child as any).props?.id || idx}
								{...(child as any).props}
								activated={activeSet}
								onToggleActivated={handleToggle}
							/>
						);
					}
					return child;
				})}
			</div>
		</div>
	);
};

export default SidebarSection;
