import { Link } from "react-router";

export const TopbarLanguageMenu = () => {
    return (
        <div className="dropdown dropdown-bottom dropdown-center">
            <div tabIndex={0} className="btn btn-ghost btn-circle btn-sm cursor-pointer">
                <img src="https://flagcdn.com/us.svg" alt="Avatar" className="rounded-box size-4.5 object-cover" />
            </div>
            <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-2 w-40 shadow">
                <ul className="menu w-full p-2">
                    <li>
                        <Link to="#" className="flex items-center gap-2">
                            <img
                                src="https://flagcdn.com/us.svg"
                                alt="Avatar"
                                className="rounded-box size-4.5 cursor-pointer object-cover"
                            />
                            <span>English</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#" className="flex items-center gap-2">
                            <img
                                src="https://flagcdn.com/in.svg"
                                alt="Avatar"
                                className="rounded-box size-4.5 cursor-pointer object-cover"
                            />
                            <span>Hindi</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#" className="flex items-center gap-2">
                            <img
                                src="https://flagcdn.com/es.svg"
                                alt="Avatar"
                                className="rounded-box size-4.5 cursor-pointer object-cover"
                            />
                            <span>Spanish</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#" className="flex items-center gap-2">
                            <img
                                src="https://flagcdn.com/cn.svg"
                                alt="Avatar"
                                className="rounded-box size-4.5 cursor-pointer object-cover"
                            />
                            <span>Chinese</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="#" className="flex items-center gap-2">
                            <img
                                src="https://flagcdn.com/rs.svg"
                                alt="Avatar"
                                className="rounded-box size-4.5 cursor-pointer object-cover"
                            />
                            <span>Arabic</span>
                        </Link>
                    </li>
                </ul>
            </div>
        </div>
    );
};
