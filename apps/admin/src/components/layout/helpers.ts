import { ISidebarMenuItem } from "./SidebarMenuItem";

// With compositional API and no config-based hierarchical arrays, activation is
// simply: mark the item whose url matches current pathname.
export const getActivatedItemParentKeys = (menuItems: ISidebarMenuItem[], url: string): Set<string> => {
    const match = menuItems.find((i) => i.url === url);
    return match ? new Set([match.id]) : new Set();
};
