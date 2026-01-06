// Molecule: SidebarMenuItem (migrated from layout/sidebar)
// TODO(atomic-migrate): remove old shim file after 2025-11
import {
  AnchorHTMLAttributes,
  ReactElement,
  ReactNode,
  isValidElement,
  Children,
} from 'react';
import { Link } from 'react-router';
import {
  SidebarMenuItemBadges,
  SidebarMenuItemBadgesProps,
} from '@/components/atoms/SidebarMenuItemBadges';
import { Icon } from '@/components/atoms/Icon';

export type SidebarMenuItemBadgesProp = SidebarMenuItemBadgesProps;

export type SidebarMenuItemProps = {
  id: string;
  icon?: string;
  iconClassName?: string;
  url?: string;
  linkProp?: AnchorHTMLAttributes<HTMLAnchorElement>;
  collapsible?: boolean;
  children?: ReactNode;
  activated?: Set<string>;
  onToggleActivated?: (key: string) => void;
} & SidebarMenuItemBadgesProp;

export function SidebarMenuItem({
  id,
  url,
  icon,
  iconClassName,
  badges,
  linkProp,
  activated,
  onToggleActivated,
  collapsible,
  children,
}: SidebarMenuItemProps) {
  const activeSet = activated || new Set<string>();
  const selected = activeSet.has(id);

  const nestedChildren: ReactElement[] = [];
  const inlineContent: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && (child.type as any) === SidebarMenuItem) {
      nestedChildren.push(child as ReactElement);
    } else if (child != null) {
      inlineContent.push(child as ReactNode);
    }
  });

  const hasNested = nestedChildren.length > 0;
  const isCollapsible = collapsible || hasNested;

  if (!isCollapsible) {
    const baseItemClasses = [
      'menu-item',
      'flex h-8 items-center gap-2 px-2.5 text-sm rounded-box',
      'transition-colors',
      'hover:bg-base-200',
      selected ? 'bg-base-200 font-medium' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <Link to={url ?? ''} className={baseItemClasses} {...linkProp}>
        {icon && (
          <Icon
            icon={icon}
            className={`shrink-0 ${iconClassName || 'size-4'}`}
          />
        )}
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
        {icon && (
          <Icon
            icon={icon}
            className={`shrink-0 ${iconClassName || 'size-4'}`}
          />
        )}
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
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default SidebarMenuItem;
