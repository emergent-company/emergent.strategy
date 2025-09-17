// Hero style page title
import { ReactNode } from "react";
import { Link } from "react-router";

type IPageTitleHeroProps = {
    label?: string;
    title: string;
    description: string;
};

export const PageTitleHero = ({ title, description, label }: IPageTitleHeroProps) => (
    <div className="flex flex-col justify-center items-center space-y-0.5">
        {label && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 border border-base-300 rounded-full text-xs text-base-content/80 leading-none tracking-[0.2px]">
                <div className="bg-base-content/30 status status-sm"></div>
                {label}
            </div>
        )}
        <p className="bg-clip-text bg-linear-to-b from-base-content to-base-content/75 pb-1 font-bold text-transparent text-3xl lg:text-4xl 2xl:text-5xl tracking-tight">
            {title}
        </p>
        <p className="max-w-lg max-md:text-sm text-base-content/80 text-center">{description}</p>
    </div>
);

export type IBreadcrumbItem = {
    label: string;
    path?: string;
    active?: boolean;
};

type IPageTitle = {
    items?: IBreadcrumbItem[];
    title: string;
    centerItem?: ReactNode;
};

// Breadcrumb style page title
export const PageTitle = ({ title, items, centerItem }: IPageTitle) => {
    return (
        <div className="flex justify-between items-center">
            <p className="font-medium text-lg">{title}</p>
            {centerItem != null && centerItem}
            <>
                {items && (
                    <div className="hidden sm:inline p-0 text-sm breadcrumbs">
                        <ul>
                            <li>
                                <Link to="/admin">Nexus</Link>
                            </li>
                            {items.map((item, index) => {
                                return (
                                    <li key={index} className={`${item.active ? "opacity-80" : ""}`}>
                                        {item.path ? (
                                            <Link key={index + 1} to={item.path}>
                                                {item.label}
                                            </Link>
                                        ) : (
                                            <>{item.label}</>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </>
        </div>
    );
};
