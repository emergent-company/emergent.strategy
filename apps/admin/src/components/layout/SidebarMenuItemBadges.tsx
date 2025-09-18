export type ISidebarMenuItemBadges = {
    badges?: Array<"new" | string>;
};

export const SidebarMenuItemBadges = ({ badges }: ISidebarMenuItemBadges) => {
    if (!badges || !badges.length) return <></>;

    return (
        <div className="inline-flex gap-2 ms-auto">
            {badges.map((badge) => {
                if (badge == "new")
                    return (
                        <div
                            key={badge}
                            className="bg-primary/10 px-1.5 border border-primary/20 rounded-box text-[12px] text-primary">
                            New
                        </div>
                    );
                return (
                    <div
                        key={badge}
                        className="bg-secondary ms-0 px-1.5 rounded-box text-[12px] text-secondary-content">
                        {badge}
                    </div>
                );
            })}
        </div>
    );
};

export default SidebarMenuItemBadges;
