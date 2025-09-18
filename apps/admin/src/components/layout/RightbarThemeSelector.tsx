import { useConfig } from "@/contexts/config";

export const RightbarThemeSelector: React.FC = () => {
	const { changeTheme } = useConfig();

	return (
		<div>
			<p className="font-medium">Theme</p>
			<div className="gap-3 grid grid-cols-3 mt-3">
				<div data-theme="light" className="group relative rounded-box cursor-pointer" onClick={() => changeTheme("light")}>
					<div className="bg-base-200 pt-5 pb-3 rounded-box text-center">
						<div className="flex justify-center items-center gap-1">
							<span className="bg-primary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-secondary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-accent rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-success rounded-box w-2 sm:w-3 h-6" />
						</div>
						<p className="mt-1.5 text-sm sm:text-base capitalize">Light</p>
					</div>
					<span className="top-2 absolute bg-primary opacity-0 group-data-[theme=light]/html:opacity-100 p-0 group-data-[theme=light]/html:p-1 rounded-full text-primary-content transition-all end-2" />
				</div>
				<div data-theme="contrast" className="group relative rounded-box cursor-pointer" onClick={() => changeTheme("contrast")}>
					<div className="bg-base-200 pt-5 pb-3 rounded-box text-center">
						<div className="flex justify-center items-center gap-1">
							<span className="bg-primary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-secondary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-accent rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-success rounded-box w-2 sm:w-3 h-6" />
						</div>
						<p className="mt-1.5 text-sm sm:text-base capitalize">Contrast</p>
					</div>
					<span className="top-2 absolute bg-primary opacity-0 group-data-[theme=contrast]/html:opacity-100 p-0 group-data-[theme=contrast]/html:p-1 rounded-full text-primary-content transition-all end-2" />
				</div>
				<div data-theme="material" className="group relative rounded-box cursor-pointer" onClick={() => changeTheme("material")}>
					<div className="bg-base-200 pt-5 pb-3 rounded-box text-center">
						<div className="flex justify-center items-center gap-1">
							<span className="bg-primary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-secondary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-accent rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-success rounded-box w-2 sm:w-3 h-6" />
						</div>
						<p className="mt-1.5 text-sm sm:text-base capitalize">Material</p>
					</div>
					<span className="top-2 absolute bg-primary opacity-0 group-data-[theme=material]/html:opacity-100 p-0 group-data-[theme=material]/html:p-1 rounded-full text-primary-content transition-all end-2" />
				</div>
				<div data-theme="dark" className="group relative rounded-box cursor-pointer" onClick={() => changeTheme("dark")}>
					<div className="bg-base-200 pt-5 pb-3 rounded-box text-center">
						<div className="flex justify-center items-center gap-1">
							<span className="bg-primary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-secondary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-accent rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-success rounded-box w-2 sm:w-3 h-6" />
						</div>
						<p className="mt-1.5 text-sm sm:text-base capitalize">Dark</p>
					</div>
					<span className="top-2 absolute bg-primary opacity-0 group-data-[theme=dark]/html:opacity-100 p-0 group-data-[theme=dark]/html:p-1 rounded-full text-primary-content transition-all end-2" />
				</div>
				<div data-theme="dim" className="group relative rounded-box cursor-pointer" onClick={() => changeTheme("dim")}>
					<div className="bg-base-200 pt-5 pb-3 rounded-box text-center">
						<div className="flex justify-center items-center gap-1">
							<span className="bg-primary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-secondary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-accent rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-success rounded-box w-2 sm:w-3 h-6" />
						</div>
						<p className="mt-2.5 text-xs sm:text-sm capitalize">Dim</p>
					</div>
					<span className="top-2 absolute bg-primary opacity-0 group-data-[theme=dim]/html:opacity-100 p-0 group-data-[theme=dim]/html:p-1 rounded-full text-primary-content transition-all end-2" />
				</div>
				<div data-theme="material-dark" className="group relative rounded-box cursor-pointer" onClick={() => changeTheme("material-dark")}>
					<div className="bg-base-200 pt-5 pb-3 rounded-box text-center">
						<div className="flex justify-center items-center gap-1">
							<span className="bg-primary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-secondary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-accent rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-success rounded-box w-2 sm:w-3 h-6" />
						</div>
						<p className="mt-2.5 text-xs sm:text-sm capitalize">Material Dark</p>
					</div>
					<span className="top-2 absolute bg-primary opacity-0 group-data-[theme=material-dark]/html:opacity-100 p-0 group-data-[theme=material-dark]/html:p-1 rounded-full text-primary-content transition-all end-2" />
				</div>
				<div className="group relative rounded-box cursor-pointer" onClick={() => changeTheme("system")}>
					<div className="bg-base-200 pt-5 pb-3 rounded-box text-center">
						<div className="flex justify-center items-center gap-1">
							<span className="bg-primary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-secondary rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-accent rounded-box w-2 sm:w-3 h-6" />
							<span className="bg-success rounded-box w-2 sm:w-3 h-6" />
						</div>
						<p className="mt-1.5 text-sm sm:text-base capitalize">System</p>
					</div>
					<span className="bg-primary text-primary-content absolute end-2 top-2 rounded-full p-0 opacity-0 transition-all group-[:not([data-theme])]/html:p-1 group-[:not([data-theme])]/html:opacity-100" />
				</div>
			</div>
		</div>
	);
};

export default RightbarThemeSelector;
