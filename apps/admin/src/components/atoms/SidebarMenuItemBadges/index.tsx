// Atom: SidebarMenuItemBadges (migrated from layout/sidebar)
// TODO(atomic-migrate): remove old shim file after 2025-11
export type SidebarMenuItemBadgesProps = {
    badges?: Array<"new" | string>;
};

export function SidebarMenuItemBadges({ badges }: SidebarMenuItemBadgesProps) {
    if (!badges || !badges.length) return null;
    return (
        <div className="inline-flex gap-2 ms-auto">
            {badges.map((badge) => {
                if (badge === "new") {
                    return (
                        <div
                            key={badge}
                            className="bg-primary/10 px-1.5 border border-primary/20 rounded-box text-[12px] text-primary"
                        >
                            New
                        </div>
                    );
                }
                return (
                    <div
                        key={badge}
                        className="bg-secondary ms-0 px-1.5 rounded-box text-[12px] text-secondary-content"
                    >
                        {badge}
                    </div>
                );
            })}
        </div>
    );
}

export default SidebarMenuItemBadges;
