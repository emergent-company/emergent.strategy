export type ISidebarMenuItemBadges = {
    badges?: Array<"new" | string>;
};

export const SidebarMenuItemBadges = ({ badges }: ISidebarMenuItemBadges) => {
    if (!badges || !badges.length) return <></>;

    return (
        <div className="ms-auto inline-flex gap-2">
            {badges.map((badge) => {
                if (badge == "new")
                    return (
                        <div
                            key={badge}
                            className="border-primary/20 bg-primary/10 text-primary rounded-box border px-1.5 text-[12px]">
                            New
                        </div>
                    );
                return (
                    <div
                        key={badge}
                        className="bg-secondary text-secondary-content rounded-box ms-0 px-1.5 text-[12px]">
                        {badge}
                    </div>
                );
            })}
        </div>
    );
};
