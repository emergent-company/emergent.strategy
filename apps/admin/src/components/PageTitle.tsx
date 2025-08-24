import { ReactNode } from "react";
import { Link } from "react-router";

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
                                <Link to="/apps/documents">Nexus</Link>
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
