import { Link } from "react-router";

// Migrated from admin-layout; eventually enhance to integrate with config context for dynamic language switching.
export const TopbarLanguageMenu: React.FC = () => {
    return (
        <div className="dropdown-bottom dropdown dropdown-center">
            <div tabIndex={0} className="cursor-pointer btn btn-ghost btn-circle btn-sm">
                <img src="https://flagcdn.com/us.svg" alt="Avatar" className="rounded-box size-4.5 object-cover" />
            </div>
            <div tabIndex={0} className="bg-base-100 shadow mt-2 rounded-box w-40 dropdown-content">
                <ul className="p-2 w-full menu">
                    <li>
                        <Link to="#" className="flex items-center gap-2">
                            <img
                                src="https://flagcdn.com/us.svg"
                                alt="Avatar"
                                className="rounded-box size-4.5 object-cover cursor-pointer"
                            />
                            <span>English</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#" className="flex items-center gap-2">
                            <img
                                src="https://flagcdn.com/in.svg"
                                alt="Avatar"
                                className="rounded-box size-4.5 object-cover cursor-pointer"
                            />
                            <span>Hindi</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#" className="flex items-center gap-2">
                            <img
                                src="https://flagcdn.com/es.svg"
                                alt="Avatar"
                                className="rounded-box size-4.5 object-cover cursor-pointer"
                            />
                            <span>Spanish</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#" className="flex items-center gap-2">
                            <img
                                src="https://flagcdn.com/cn.svg"
                                alt="Avatar"
                                className="rounded-box size-4.5 object-cover cursor-pointer"
                            />
                            <span>Chinese</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#" className="flex items-center gap-2">
                            <img
                                src="https://flagcdn.com/rs.svg"
                                alt="Avatar"
                                className="rounded-box size-4.5 object-cover cursor-pointer"
                            />
                            <span>Arabic</span>
                        </Link>
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default TopbarLanguageMenu;
