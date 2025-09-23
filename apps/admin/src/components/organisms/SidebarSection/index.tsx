// Organism: SidebarSection (migrated from layout/sidebar)
// Maintains activation state for nested SidebarMenuItem components when parent Sidebar does not control it.
// TODO(atomic-migrate): remove old shim after 2025-11
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { SidebarMenuItem, SidebarMenuItemProps } from '@/components/molecules/SidebarMenuItem';
import { getActivatedItemParentKeys } from '@/utils/sidebar/activation';

export interface SidebarSectionProps {
    id?: string;
    title?: string;
    children: React.ReactNode;
    activated?: Set<string>; // externally managed activated parent ids
    onToggleActivated?: (key: string) => void; // external toggle handler when provided
    className?: string;
}

interface ExtractedItem extends Omit<SidebarMenuItemProps, 'activated' | 'onToggleActivated' | 'children'> {
    children?: React.ReactNode;
}

export function SidebarSection({
    id,
    title,
    children,
    activated,
    onToggleActivated,
    className = '',
}: SidebarSectionProps) {
    const { pathname } = useLocation();
    const [localActivated, setLocalActivated] = useState<Set<string>>(activated || new Set());

    const arrayChildren = useMemo(() => (Array.isArray(children) ? children : [children]), [children]);
    const items: ExtractedItem[] = useMemo(() => {
        const acc: ExtractedItem[] = [];
        arrayChildren.forEach((child: any) => {
            if (child && (child.type === SidebarMenuItem)) {
                const { activated: _a, onToggleActivated: _b, ...rest } = child.props || {};
                acc.push(rest as ExtractedItem);
            }
        });
        return acc;
    }, [arrayChildren]);

    // Auto derive activated parents if not externally managed
    useEffect(() => {
        if (!activated) {
            setLocalActivated(getActivatedItemParentKeys(items as any, pathname));
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
                <div className="px-3 pt-3 pb-1 font-medium text-xs text-base-content/50 uppercase tracking-wide">
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
}

export default SidebarSection;
