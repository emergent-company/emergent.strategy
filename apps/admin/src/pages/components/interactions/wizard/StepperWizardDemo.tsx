import { useWizard } from "./use-wizard";

const steps = ["Personal Details", "Account Settings", "Permissions", "Review"];

export const StepperWizardDemo = () => {
    const { currentStep, goTo, goNext, canNext, canPrevious, goPrevious, isLastStep } = useWizard(4);

    return (
        <div>
            <div className="flex items-center gap-3 text-sm">
                {steps.map((step, index) => (
                    <div key={index} className="flex items-center gap-3">
                        <div
                            className="text-base-content/80 hover:text-base-content flex cursor-pointer items-center gap-2"
                            onClick={() => goTo(index + 1)}>
                            <div
                                className={`flex size-6 items-center justify-center rounded-full font-medium ${index + 1 >= currentStep ? "bg-base-200" : "bg-primary text-primary-content"}`}>
                                <span
                                    className={`iconify lucide--check ${index + 1 >= currentStep ? "hidden" : ""}`}></span>
                                <span className={`${index + 1 >= currentStep ? "" : "hidden"}`}>{index + 1}</span>
                            </div>
                            <span className="font-medium max-lg:hidden">{step}</span>
                        </div>
                        {index + 1 < steps.length && (
                            <span className="iconify lucide--chevron-right text-base-content/60"></span>
                        )}
                    </div>
                ))}
            </div>
            <div className="bg-base-100 border-base-300 rounded-box mt-6 border p-5">
                {currentStep == 1 && (
                    <div className="">
                        <div className="bg-base-200 rounded-box flex w-fit items-center gap-2.5 px-3 py-1.5">
                            <span className="iconify lucide--user size-3.5"></span>
                            <span className="text-sm font-medium">Personal Details</span>
                        </div>
                        <div className="fieldset mt-4 grid grow grid-cols-1 gap-5 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="name">
                                    Full Name
                                </label>
                                <label className="input w-full">
                                    <span className="iconify lucide--user text-base-content/60 size-4.5"></span>
                                    <input
                                        type="text"
                                        className="grow"
                                        placeholder="Name"
                                        id="name"
                                        defaultValue="Denish Navadiya"
                                    />
                                </label>
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label">User</label>
                                <label className="input w-full">
                                    <span className="label">nexus.com/</span>
                                    <input placeholder="username" type="text" defaultValue="withden" />
                                </label>
                            </div>

                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="email">
                                    Email
                                </label>
                                <label className="input w-full">
                                    <span className="iconify lucide--mail text-base-content/60 size-4.5"></span>
                                    <input
                                        type="text"
                                        className="grow"
                                        placeholder="Email"
                                        id="email"
                                        defaultValue="test@gmail.com"
                                    />
                                </label>
                            </div>

                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="mobile">
                                    Mobile
                                </label>
                                <label className="input w-full">
                                    <span className="iconify lucide--phone text-base-content/60 size-4.5"></span>
                                    <input
                                        type="text"
                                        className="grow"
                                        placeholder="Mobile"
                                        id="mobile"
                                        defaultValue="(+123) 9876543210"
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                )}
                {currentStep == 2 && (
                    <div className="">
                        <div className="bg-base-200 rounded-box flex w-fit items-center gap-2.5 px-3 py-1.5">
                            <span className="iconify lucide--settings-2 size-3.5"></span>
                            <span className="text-sm font-medium">Account Settings</span>
                        </div>
                        <div className="fieldset mt-4 grid grow grid-cols-1 gap-5 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="password">
                                    Password
                                </label>
                                <label className="input w-full">
                                    <span className="iconify lucide--lock text-base-content/60 size-4.5"></span>
                                    <input
                                        type="password"
                                        className="grow"
                                        placeholder="••••••••"
                                        id="password"
                                        defaultValue=""
                                    />
                                </label>
                            </div>

                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="confirm-password">
                                    Confirm Password
                                </label>
                                <label className="input w-full">
                                    <span className="iconify lucide--lock text-base-content/60 size-4.5"></span>
                                    <input
                                        type="password"
                                        className="grow"
                                        placeholder="••••••••"
                                        id="confirm-password"
                                        defaultValue=""
                                    />
                                </label>
                            </div>

                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="language">
                                    Language
                                </label>
                                <select
                                    className="select w-full"
                                    defaultValue="english"
                                    aria-label="Language"
                                    id="language">
                                    <option value="english">English</option>
                                    <option value="spanish">Spanish</option>
                                    <option value="german">German</option>
                                    <option value="hindi">Hindi</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="timezone">
                                    Timezone
                                </label>
                                <select
                                    className="select w-full"
                                    defaultValue="IST"
                                    aria-label="Timezone"
                                    id="timezone">
                                    <option value="UTC">UTC</option>
                                    <option value="IST">IST</option>
                                    <option value="PST">PST</option>
                                    <option value="CET">CET</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
                {currentStep == 3 && (
                    <div className="">
                        <div className="bg-base-200 rounded-box flex w-fit items-center gap-2.5 px-3 py-1.5">
                            <span className="iconify lucide--shield-check size-3.5"></span>
                            <span className="text-sm font-medium">Permissions</span>
                        </div>
                        <div className="fieldset mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="user-role">
                                    Role
                                </label>
                                <select
                                    className="select w-full"
                                    defaultValue="viewer"
                                    aria-label="User Role"
                                    id="user-role">
                                    <option value="admin">Admin</option>
                                    <option value="editor">Editor</option>
                                    <option value="viewer">Viewer</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="feature-access">
                                    Feature Access
                                </label>
                                <select
                                    className="select w-full"
                                    defaultValue="limited"
                                    aria-label="Feature Access"
                                    id="feature-access">
                                    <option value="full">Full Access</option>
                                    <option value="limited">Limited Access</option>
                                    <option value="custom">Custom</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="api-access">
                                    API Access
                                </label>
                                <select
                                    className="select w-full"
                                    defaultValue="enabled"
                                    aria-label="API Access"
                                    id="api-access">
                                    <option value="enabled">Enabled</option>
                                    <option value="disabled">Disabled</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
                {currentStep == 4 && (
                    <div className="bg-base-100 rounded-box">
                        <div className="bg-base-200 rounded-box flex w-fit items-center gap-2.5 px-3 py-1.5">
                            <span className="iconify lucide--check-circle-2 size-3.5"></span>
                            <span className="text-sm font-medium">Review Details</span>
                        </div>

                        <div className="mt-5 space-y-3.5 text-sm">
                            <div className="flex">
                                <span className="w-40 font-medium">Username:</span>
                                <span className="text-base-content/80">withden</span>
                            </div>
                            <div className="flex">
                                <span className="w-40 font-medium">Full Name:</span>
                                <span className="text-base-content/80">Denish Navadiya</span>
                            </div>
                            <div className="flex">
                                <span className="w-40 font-medium">Email:</span>
                                <span className="text-base-content/80">test@gmail.com</span>
                            </div>
                            <div className="flex">
                                <span className="w-40 font-medium">Account Settings:</span>
                                <span className="text-base-content/80">Normal</span>
                            </div>
                            <div className="flex">
                                <span className="w-40 font-medium">Permission:</span>
                                <span className="text-base-content/80">User-level</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-4 flex justify-between">
                {canPrevious && (
                    <button className="btn gap-2" onClick={goPrevious}>
                        <span className="iconify lucide--chevron-left size-4"></span>
                        <span>Prev</span>
                    </button>
                )}
                {canNext && (
                    <button className="btn ms-auto gap-2" onClick={goNext}>
                        <span>Next</span>
                        <span className="iconify lucide--chevron-right size-4"></span>
                    </button>
                )}
                {isLastStep && (
                    <button className="btn btn-primary ms-auto gap-2">
                        <span className="iconify lucide--flag size-4"></span>
                        <span>Finish</span>
                    </button>
                )}
            </div>
        </div>
    );
};
