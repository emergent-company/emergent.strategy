import type { ComponentProps } from "react";

type Props = ComponentProps<"label"> & {
    hoverMode?: boolean;
};
import { Icon } from "@/components/ui/Icon";

export const TopbarLeftmenuToggle = ({ hoverMode = false, className, ...rest }: Props) => {
    const targetId = hoverMode ? "layout-sidebar-hover-trigger" : "layout-sidebar-toggle-trigger";
    const base = "btn btn-square btn-ghost btn-sm";
    const visibility = hoverMode
        ? "hidden group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:flex"
        : "group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:hidden";
    return (
        <label htmlFor={targetId} aria-label="Leftmenu toggle" className={`${base} ${visibility} ${className ?? ""}`} {...rest}>
            <Icon icon="lucide--menu" className="size-5" />
        </label>
    );
};
