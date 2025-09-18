import { ThemeToggle } from "@/components/ThemeToggle";
import { TopbarNotificationButton } from "./TopbarNotificationButton";
import { TopbarProfileMenu } from "./TopbarProfileMenu";
import { TopbarSearchButton } from "./TopbarSearchButton";
import { TopbarLeftmenuToggle } from "./TopbarLeftmenuToggle";
import { TopbarRightbarButton } from "./TopbarRightbarButton";

export const Topbar = () => {
	return (
		<div
			role="navigation"
			aria-label="Navbar"
			className="flex justify-between items-center px-3"
			id="layout-topbar">
			<div className="inline-flex items-center gap-3">
				<TopbarLeftmenuToggle />
				<TopbarLeftmenuToggle hoverMode />
				<TopbarSearchButton />
			</div>
			<div className="inline-flex items-center gap-0.5">
				<ThemeToggle className="btn btn-sm btn-circle btn-ghost" />
				<TopbarRightbarButton />
				<TopbarNotificationButton />
				<TopbarProfileMenu />
			</div>
		</div>
	);
};

export default Topbar;
