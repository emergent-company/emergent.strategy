// Utility: activation (migrated from layout/sidebar/helpers.ts)
// TODO(atomic-migrate): remove legacy shim after 2025-11
import { SidebarMenuItemProps } from '@/components/molecules/SidebarMenuItem';

export const getActivatedItemParentKeys = (
    menuItems: Pick<SidebarMenuItemProps, 'id' | 'url'>[],
    url: string,
): Set<string> => {
    const match = menuItems.find((i) => i.url === url);
    return match ? new Set([match.id]) : new Set();
};

export default getActivatedItemParentKeys;
