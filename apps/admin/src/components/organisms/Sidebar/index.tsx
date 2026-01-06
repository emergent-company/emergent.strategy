// Organism: Sidebar (migrated from layout/sidebar/Sidebar)
// TODO(atomic-migrate): remove legacy shim after 2025-11
import { useEffect, useRef, useState, useMemo, ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import SimpleBarCore from 'simplebar-core';
// @ts-ignore simplebar-react types
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';

// Using atomic path (removed dependency on root deprecation shim)
import { Logo } from '@/components/atoms/Logo';
import { Icon } from '@/components/atoms/Icon';
import { useConfig } from '@/contexts/config';
import {
  SidebarMenuItem,
  type SidebarMenuItemProps,
} from '@/components/molecules/SidebarMenuItem';
import { SidebarMenuItemBadges } from '@/components/atoms/SidebarMenuItemBadges';
import { SidebarProjectDropdown } from '@/components/organisms/SidebarProjectDropdown';
import { getActivatedItemParentKeys } from '@/utils/sidebar/activation';
import { SidebarSection } from '@/components/organisms/SidebarSection';

export interface SidebarProps {
  /** Compositional children: one or more <SidebarSection /> elements */
  children: ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
  const { pathname } = useLocation();
  const { calculatedSidebarTheme } = useConfig();
  const scrollRef = useRef<SimpleBarCore | null>(null);
  const hasMounted = useRef(false);

  const arrayChildren = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children]
  );
  const primaryItems: Pick<SidebarMenuItemProps, 'id' | 'url'>[] =
    useMemo(() => {
      const acc: Pick<SidebarMenuItemProps, 'id' | 'url'>[] = [];
      arrayChildren.forEach((section: any) => {
        if (section && section.type === SidebarSection) {
          const sectionChildren = Array.isArray(section.props?.children)
            ? section.props.children
            : [section.props?.children];
          sectionChildren.forEach((itemNode: any) => {
            if (itemNode && itemNode.type === SidebarMenuItem) {
              const {
                activated: _a,
                onToggleActivated: _b,
                children: _c,
                collapsible: _d,
                ...rest
              } = itemNode.props || {};
              acc.push(rest as Pick<SidebarMenuItemProps, 'id' | 'url'>);
            }
          });
        }
      });
      return acc;
    }, [arrayChildren]);

  const [activatedParents, setActivatedParents] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    setActivatedParents(getActivatedItemParentKeys(primaryItems, pathname));
  }, [primaryItems, pathname]);

  const onToggleActivated = (key: string) => {
    setActivatedParents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    setTimeout(() => {
      const contentElement = scrollRef.current?.getContentElement();
      const scrollElement = scrollRef.current?.getScrollElement();
      if (contentElement) {
        const activatedItem =
          contentElement.querySelector<HTMLElement>('.active');
        const top = activatedItem?.getBoundingClientRect().top;
        if (activatedItem && scrollElement && top && top !== 0) {
          scrollElement.scrollTo({
            top: scrollElement.scrollTop + top - 300,
            behavior: 'smooth',
          });
        }
      }
    }, 100);
  }, [activatedParents]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (window.innerWidth <= 64 * 16) {
      const sidebarTrigger = document.querySelector<HTMLInputElement>(
        '#layout-sidebar-toggle-trigger'
      );
      if (sidebarTrigger) sidebarTrigger.checked = false;
    }
  }, [pathname]);

  return (
    <>
      <input
        type="checkbox"
        id="layout-sidebar-toggle-trigger"
        className="hidden"
        aria-label="Toggle layout sidebar"
      />
      <input
        type="checkbox"
        id="layout-sidebar-hover-trigger"
        className="hidden"
        aria-label="Dense layout sidebar"
      />
      <div id="layout-sidebar-hover" className="bg-base-300 w-1 h-screen" />

      <div
        id="layout-sidebar"
        className="flex flex-col sidebar-menu"
        data-theme={calculatedSidebarTheme}
      >
        <div className="flex justify-between items-center gap-3 ps-5 pe-4 h-16 min-h-16">
          <Link to="/admin">
            <Logo />
          </Link>
          <label
            htmlFor="layout-sidebar-hover-trigger"
            title="Toggle sidebar hover"
            className="max-lg:hidden relative text-base-content/50 btn btn-circle btn-ghost btn-sm"
          >
            <Icon
              icon="lucide--panel-left-close"
              className="absolute opacity-100 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-0 size-4.5 transition-all duration-300"
            />
            <Icon
              icon="lucide--panel-left-dashed"
              className="absolute opacity-0 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-100 size-4.5 transition-all duration-300"
            />
          </label>
        </div>

        <div className="relative min-h-0 grow">
          <SimpleBar ref={scrollRef} className="size-full custom-scrollbar">
            <div className="pb-3">
              {arrayChildren.map((child, idx) => {
                if (child && (child as any).type === SidebarSection) {
                  return (
                    <SidebarSection
                      key={(child as any).key || idx}
                      {...(child as any).props}
                      activated={activatedParents}
                      onToggleActivated={onToggleActivated}
                    />
                  );
                }
                return child;
              })}
            </div>
          </SimpleBar>
          <div className="bottom-0 absolute bg-linear-to-t from-base-100/60 to-transparent h-7 pointer-events-none start-0 end-0" />
        </div>
      </div>

      <label
        htmlFor="layout-sidebar-toggle-trigger"
        id="layout-sidebar-backdrop"
      />
    </>
  );
}

// Provide compound style static members for backward ergonomics at the new path
Sidebar.Section = SidebarSection as any;
Sidebar.MenuItem = SidebarMenuItem as any;
Sidebar.ProjectDropdown = SidebarProjectDropdown as any;
Sidebar.MenuItemBadges = SidebarMenuItemBadges as any;

export default Sidebar;
