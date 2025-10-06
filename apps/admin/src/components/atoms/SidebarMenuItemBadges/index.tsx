// Atom: SidebarMenuItemBadges (migrated from layout/sidebar)
// TODO(atomic-migrate): remove old shim file after 2025-11

export type BadgeObject = {
    label: string;
    variant?: 'info' | 'warning' | 'primary' | 'neutral' | 'error' | 'success';
};

export type SidebarMenuItemBadgesProps = {
    badges?: Array<"new" | string | BadgeObject>;
};

export function SidebarMenuItemBadges({ badges }: SidebarMenuItemBadgesProps) {
    if (!badges || !badges.length) return null;
    return (
        <div className="inline-flex gap-2 ms-auto">
            {badges.map((badge, index) => {
                // Handle "new" keyword
                if (badge === "new") {
                    return (
                        <div
                            key="new"
                            className="bg-primary/10 px-1.5 border border-primary/20 rounded-box text-[12px] text-primary"
                        >
                            New
                        </div>
                    );
                }

                // Handle badge objects with label and variant
                if (typeof badge === 'object' && badge !== null) {
                    const variant = badge.variant || 'secondary';
                    const variantClasses: Record<string, string> = {
                        info: 'bg-info/20 text-info border border-info/30',
                        warning: 'bg-warning/20 text-warning border border-warning/30',
                        primary: 'bg-primary/20 text-primary border border-primary/30',
                        neutral: 'bg-neutral/20 text-neutral border border-neutral/30',
                        error: 'bg-error/20 text-error border border-error/30',
                        success: 'bg-success/20 text-success border border-success/30',
                    };

                    return (
                        <div
                            key={`${badge.label}-${index}`}
                            className={`px-1.5 rounded-box text-[12px] ${variantClasses[variant] || variantClasses.neutral}`}
                        >
                            {badge.label}
                        </div>
                    );
                }

                // Handle simple string badges (backward compatibility)
                return (
                    <div
                        key={typeof badge === 'string' ? badge : `badge-${index}`}
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
