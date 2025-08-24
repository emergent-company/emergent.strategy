import { Link } from "react-router";

export const Showcase = () => {
    return (
        <div id="features">
            <div className="relative container py-8 md:py-12 xl:py-16 2xl:py-24">
                <div className="relative z-10 grid gap-12 lg:grid-cols-7 lg:gap-24">
                    <div className="flex flex-col max-sm:items-center max-sm:text-center lg:col-span-3">
                        <div className="rounded-box inline-flex w-fit items-center border border-teal-500/5 bg-teal-500/5 p-2.5">
                            <span className="iconify lucide--box size-5 text-teal-600" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold sm:text-3xl">UI Toolkit</p>
                        <p className="text-base-content/70 mt-4 max-sm:text-sm">
                            Explore essential components like sidebars, footers, buttons, forms, tables, menus, modals,
                            notification menus, and more for your admin dashboard.
                        </p>
                        <div className="mt-6">
                            <Link to="/components" className="btn btn-outline btn-sm btn-neutral">
                                View Components
                                <span className="iconify lucide--chevron-right" />
                            </Link>
                        </div>
                    </div>
                    <div className="relative lg:col-span-4">
                        <div className="absolute -start-50 -top-50 z-[-1] size-[450px] bg-[url(/images/landing/showcase-bg-gradient.png)] bg-cover bg-center bg-no-repeat opacity-20 sm:size-[600px] dark:hidden"></div>
                        <div className="absolute -end-12 -bottom-12 z-[-1] size-[350px] bg-[url(/images/landing/showcase-bg-element.png)] bg-cover bg-center bg-no-repeat opacity-60 max-lg:hidden sm:size-[120px] dark:opacity-60"></div>
                        <div className="from-base-100/60 to-base-100 rounded-box bg-linear-to-tl to-[20%] p-4 text-center backdrop-blur-[4px] md:p-6 lg:p-8 xl:p-10">
                            <div className="flex flex-wrap justify-center gap-6">
                                <button className="btn btn-secondary btn-sm">
                                    <span className="iconify lucide--search size-3.5" />
                                    Search
                                </button>
                                <button className="btn btn-ghost btn-sm">
                                    <span className="iconify lucide--upload size-3.5" />
                                    Upload
                                </button>
                                <button className="btn btn-primary btn-circle btn-sm" aria-label="Buy Now">
                                    <span className="iconify lucide--shopping-cart size-4" />
                                </button>
                                <div className="dropdown">
                                    <div tabIndex={0} role="button" className="btn btn-sm">
                                        Dropdown
                                    </div>
                                    <ul
                                        tabIndex={0}
                                        className="dropdown-content menu bg-base-100 rounded-box z-1 w-40 p-2 shadow-sm">
                                        <li>
                                            <a>Item 1</a>
                                        </li>
                                        <li>
                                            <a>Item 2</a>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            <div className="mt-10 flex flex-wrap justify-center gap-6">
                                <div role="tablist" className="tabs tabs-border tabs-sm">
                                    <input
                                        role="tab"
                                        className="tab"
                                        aria-label="Tailwind CSS"
                                        type="radio"
                                        name="demo-tabs-radio"
                                    />
                                    <input
                                        role="tab"
                                        className="tab"
                                        aria-label="DaisyUI"
                                        type="radio"
                                        defaultChecked
                                        name="demo-tabs-radio"
                                    />
                                    <input
                                        role="tab"
                                        className="tab"
                                        aria-label="Nexus"
                                        type="radio"
                                        name="demo-tabs-radio"
                                    />
                                </div>
                                <span className="loading loading-ring text-primary"></span>
                                <span className="loading loading-bars text-primary"></span>
                                <span className="loading loading-infinity text-primary"></span>
                            </div>
                            <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
                                <div className="avatar">
                                    <div className="bg-base-200 w-10 rounded-full">
                                        <img alt="Avatar" src="/images/avatars/1.png" />
                                    </div>
                                </div>
                                <div className="avatar-group -space-x-5">
                                    <div className="avatar">
                                        <div className="bg-base-200 w-10 rounded-full">
                                            <img alt="Avatar" src="/images/avatars/4.png" />
                                        </div>
                                    </div>
                                    <div className="avatar">
                                        <div className="bg-base-200 w-10 rounded-full">
                                            <img alt="Avatar" src="/images/avatars/5.png" />
                                        </div>
                                    </div>
                                    <div className="avatar">
                                        <div className="bg-base-200 w-10 rounded-full">
                                            <img alt="Avatar" src="/images/avatars/7.png" />
                                        </div>
                                    </div>
                                    <div className="avatar avatar-placeholder">
                                        <div className="bg-base-300 w-10 rounded-full">+99</div>
                                    </div>
                                </div>

                                <div className="join">
                                    <button className="btn join-item btn-square btn-sm">1</button>
                                    <button className="btn join-item btn-square btn-sm btn-active">2</button>
                                    <button className="btn join-item btn-square btn-sm">3</button>
                                    <button className="btn join-item btn-square btn-sm">4</button>
                                </div>
                                <div className="alert alert-info w-fit gap-2 px-2 py-1.5" role="alert">
                                    <span className="iconify lucide--info size-5"></span>
                                    <span>New update available.</span>
                                </div>
                            </div>
                            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                                <div className="inline-flex gap-2">
                                    <input
                                        type="radio"
                                        className="radio"
                                        name="showcase_radio"
                                        aria-label="showcase radio 1"
                                        defaultChecked
                                    />
                                    <input
                                        type="radio"
                                        className="radio"
                                        name="showcase_radio"
                                        aria-label="showcase radio 2"
                                    />
                                </div>
                                <div className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        className="toggle toggle-sm toggle-primary"
                                        id="showcase_toggle"
                                        defaultChecked
                                    />
                                    <label className="label" htmlFor="showcase_toggle">
                                        Toggle
                                    </label>
                                </div>
                                <div className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-error checkbox-sm"
                                        id="showcase_checkbox"
                                        defaultChecked
                                    />
                                    <label className="label" htmlFor="showcase_checkbox">
                                        Checkbox
                                    </label>
                                </div>
                                <div className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-sm"
                                        id="showcase_checkbox_disabled"
                                        disabled
                                    />
                                    <label className="label text-base-content/40" htmlFor="showcase_checkbox_disabled">
                                        Disabled
                                    </label>
                                </div>
                            </div>

                            <div className="mt-10 grid gap-6 md:grid-cols-2">
                                <div className="col-span-1">
                                    <div className="rating gap-1">
                                        <input
                                            className="mask mask-heart bg-red-400"
                                            aria-label="1 star"
                                            type="radio"
                                            name="rating-3"
                                        />
                                        <input
                                            className="mask mask-heart bg-orange-400"
                                            aria-label="2 star"
                                            type="radio"
                                            name="rating-3"
                                        />
                                        <input
                                            className="mask mask-heart bg-yellow-400"
                                            aria-label="3 star"
                                            type="radio"
                                            name="rating-3"
                                        />
                                        <input
                                            className="mask mask-heart bg-lime-400"
                                            aria-label="4 star"
                                            type="radio"
                                            defaultChecked
                                            name="rating-3"
                                        />
                                        <input
                                            className="mask mask-heart bg-green-400"
                                            aria-label="5 star"
                                            type="radio"
                                            name="rating-3"
                                        />
                                    </div>
                                    <div>
                                        <fieldset className="fieldset mt-4">
                                            <legend className="fieldset-legend text-start">Title</legend>
                                            <input
                                                className="input"
                                                placeholder="My awesome page"
                                                type="text"
                                                aria-label="Input"
                                            />
                                            <p className="fieldset-label">* Required</p>
                                        </fieldset>
                                    </div>
                                    <div className="form-control mt-4">
                                        <textarea className="textarea" placeholder="Bio" />
                                    </div>
                                    <div className="mt-5">
                                        <input
                                            type="range"
                                            aria-label="Input"
                                            className="range range-xs range-primary"
                                            id="showcase_range"
                                        />
                                    </div>

                                    <div className="mt-2">
                                        <progress
                                            aria-label="showcase progress"
                                            max={100}
                                            id="showcase_progress"
                                            className="progress progress-success h-1 w-full"
                                        />
                                        <label className="hidden" htmlFor="showcase_progress">
                                            Progress
                                        </label>
                                    </div>
                                </div>
                                <div className="col-span-1">
                                    <div className="card bg-base-100 card-border">
                                        <div className="card-body text-start">
                                            <div className="flex items-center gap-3">
                                                <div className="avatar">
                                                    <div className="bg-base-200 mask mask-squircle w-8">
                                                        <img src="/images/avatars/1.png" alt="Avatar" />
                                                    </div>
                                                </div>
                                                <div className="text-start">
                                                    <p className="leading-none">James Ford</p>
                                                    <p className="text-base-content/60 text-xs">Designer & Developer</p>
                                                </div>
                                            </div>
                                            <img
                                                src="/images/landing/showcase-card-image.png"
                                                className="rounded-box mt-3"
                                                alt="card"
                                            />
                                            <p className="text-base-content/80 mt-0.5 text-center text-xs italic">
                                                Image caption
                                            </p>
                                            <p className="mt-2">More Text goes here....</p>
                                            <div className="card-actions mt-3 justify-end">
                                                <button className="btn btn-sm btn-ghost">Cancel</button>
                                                <button className="btn btn-primary btn-sm">Action</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
