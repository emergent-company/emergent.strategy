import { Link } from 'react-router';
import { Icon } from '@/components/atoms/Icon';

export const Showcase = () => {
  return (
    <div id="features">
      <div className="relative py-8 md:py-12 2xl:py-24 xl:py-16 container">
        <div className="z-10 relative gap-12 lg:gap-24 grid lg:grid-cols-7">
          <div className="flex flex-col max-sm:items-center lg:col-span-3 max-sm:text-center">
            <div className="inline-flex items-center bg-teal-500/5 p-2.5 border border-teal-500/5 rounded-box w-fit">
              <Icon
                icon="lucide--box"
                className="size-5 text-teal-600"
                ariaLabel="Toolkit"
              />
            </div>
            <p className="mt-3 font-semibold text-2xl sm:text-3xl">
              UI Toolkit
            </p>
            <p className="mt-4 max-sm:text-sm text-base-content/70">
              Explore essential components like sidebars, footers, buttons,
              forms, tables, menus, modals, notification menus, and more for
              your admin dashboard.
            </p>
            <div className="mt-6">
              <Link to="/admin" className="btn-outline btn btn-sm btn-neutral">
                Go to Dashboard
                <Icon icon="lucide--chevron-right" aria-hidden />
              </Link>
            </div>
          </div>
          <div className="relative lg:col-span-4">
            <div className="dark:hidden -top-50 z-[-1] absolute bg-[url(/images/landing/showcase-bg-gradient.png)] bg-cover bg-no-repeat bg-center opacity-20 size-[450px] sm:size-[600px] -start-50"></div>
            <div className="max-lg:hidden -bottom-12 z-[-1] absolute bg-[url(/images/landing/showcase-bg-element.png)] bg-cover bg-no-repeat bg-center opacity-60 dark:opacity-60 size-[350px] sm:size-[120px] -end-12"></div>
            <div className="bg-linear-to-tl from-base-100/60 to-[20%] to-base-100 backdrop-blur-[4px] p-4 md:p-6 lg:p-8 xl:p-10 rounded-box text-center">
              <div className="flex flex-wrap justify-center gap-6">
                <button className="btn btn-secondary btn-sm">
                  <Icon
                    icon="lucide--search"
                    className="size-3.5"
                    ariaLabel="Search"
                  />
                  Search
                </button>
                <button className="btn btn-ghost btn-sm">
                  <Icon
                    icon="lucide--upload"
                    className="size-3.5"
                    ariaLabel="Upload"
                  />
                  Upload
                </button>
                <button
                  className="btn btn-primary btn-circle btn-sm"
                  aria-label="Buy Now"
                >
                  <Icon
                    icon="lucide--shopping-cart"
                    className="size-4"
                    aria-hidden
                  />
                </button>
                <div className="dropdown">
                  <div tabIndex={0} role="button" className="btn btn-sm">
                    Dropdown
                  </div>
                  <ul
                    tabIndex={0}
                    className="z-1 bg-base-100 shadow-sm p-2 rounded-box w-40 dropdown-content menu"
                  >
                    <li>
                      <a>Item 1</a>
                    </li>
                    <li>
                      <a>Item 2</a>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-6 mt-10">
                <div role="tablist" className="tabs-border tabs tabs-sm">
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
                    aria-label="Emergent"
                    type="radio"
                    name="demo-tabs-radio"
                  />
                </div>
                <span className="loading-ring text-primary loading"></span>
                <span className="text-primary loading loading-bars"></span>
                <span className="text-primary loading loading-infinity"></span>
              </div>
              <div className="flex flex-wrap justify-center items-center gap-6 mt-10">
                <div className="avatar">
                  <div className="bg-base-200 rounded-full w-10">
                    <img alt="Avatar" src="/images/avatars/1.png" />
                  </div>
                </div>
                <div className="avatar-group -space-x-5">
                  <div className="avatar">
                    <div className="bg-base-200 rounded-full w-10">
                      <img alt="Avatar" src="/images/avatars/4.png" />
                    </div>
                  </div>
                  <div className="avatar">
                    <div className="bg-base-200 rounded-full w-10">
                      <img alt="Avatar" src="/images/avatars/5.png" />
                    </div>
                  </div>
                  <div className="avatar">
                    <div className="bg-base-200 rounded-full w-10">
                      <img alt="Avatar" src="/images/avatars/7.png" />
                    </div>
                  </div>
                  <div className="avatar avatar-placeholder">
                    <div className="bg-base-300 rounded-full w-10">+99</div>
                  </div>
                </div>

                <div className="join">
                  <button className="btn join-item btn-square btn-sm">1</button>
                  <button className="btn join-item btn-square btn-sm btn-active">
                    2
                  </button>
                  <button className="btn join-item btn-square btn-sm">3</button>
                  <button className="btn join-item btn-square btn-sm">4</button>
                </div>
                <div
                  className="gap-2 px-2 py-1.5 w-fit alert alert-info"
                  role="alert"
                >
                  <Icon icon="lucide--info" className="size-5" aria-hidden />
                  <span>New update available.</span>
                </div>
              </div>
              <div className="flex flex-wrap justify-center items-center gap-4 mt-10">
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
                  <label
                    className="text-base-content/40 label"
                    htmlFor="showcase_checkbox_disabled"
                  >
                    Disabled
                  </label>
                </div>
              </div>

              <div className="gap-6 grid md:grid-cols-2 mt-10">
                <div className="col-span-1">
                  <div className="gap-1 rating">
                    <input
                      className="bg-red-400 mask mask-heart"
                      aria-label="1 star"
                      type="radio"
                      name="rating-3"
                    />
                    <input
                      className="bg-orange-400 mask mask-heart"
                      aria-label="2 star"
                      type="radio"
                      name="rating-3"
                    />
                    <input
                      className="bg-yellow-400 mask mask-heart"
                      aria-label="3 star"
                      type="radio"
                      name="rating-3"
                    />
                    <input
                      className="bg-lime-400 mask mask-heart"
                      aria-label="4 star"
                      type="radio"
                      defaultChecked
                      name="rating-3"
                    />
                    <input
                      className="bg-green-400 mask mask-heart"
                      aria-label="5 star"
                      type="radio"
                      name="rating-3"
                    />
                  </div>
                  <div>
                    <fieldset className="mt-4 fieldset">
                      <legend className="text-start fieldset-legend">
                        Title
                      </legend>
                      <input
                        className="input"
                        placeholder="My awesome page"
                        type="text"
                        aria-label="Input"
                      />
                      <p className="fieldset-label">* Required</p>
                    </fieldset>
                  </div>
                  <div className="mt-4 form-control">
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
                      className="w-full h-1 progress progress-success"
                    />
                    <label className="hidden" htmlFor="showcase_progress">
                      Progress
                    </label>
                  </div>
                </div>
                <div className="col-span-1">
                  <div className="bg-base-100 card-border card">
                    <div className="text-start card-body">
                      <div className="flex items-center gap-3">
                        <div className="avatar">
                          <div className="bg-base-200 w-8 mask mask-squircle">
                            <img src="/images/avatars/1.png" alt="Avatar" />
                          </div>
                        </div>
                        <div className="text-start">
                          <p className="leading-none">James Ford</p>
                          <p className="text-xs text-base-content/60">
                            Designer & Developer
                          </p>
                        </div>
                      </div>
                      <img
                        src="/images/landing/showcase-card-image.png"
                        className="mt-3 rounded-box"
                        alt="card"
                      />
                      <p className="mt-0.5 text-xs text-base-content/80 text-center italic">
                        Image caption
                      </p>
                      <p className="mt-2">More Text goes here....</p>
                      <div className="justify-end mt-3 card-actions">
                        <button className="btn btn-sm btn-ghost">Cancel</button>
                        <button className="btn btn-primary btn-sm">
                          Action
                        </button>
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
