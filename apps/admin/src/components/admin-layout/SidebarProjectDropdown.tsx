/**
 * SidebarProjectDropdown
 *
 * Migration note: This component used to be injected internally by `Sidebar`.
 * It is now a first-class composable child. To include the project switcher, place it
 * as the first child inside `<Sidebar>` before any `<SidebarSection />`:
 *
 * <Sidebar>
 *   <SidebarProjectDropdown />
 *   <SidebarSection id="core" title="Core">...</SidebarSection>
 * </Sidebar>
 */
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

import { useConfig } from "@/contexts/config";
import { useProjects } from "@/hooks/use-projects";

export const SidebarProjectDropdown = () => {
    const { config, setActiveProject } = useConfig();
    const { projects, loading, error, createProject } = useProjects();

    return (
        <>
            <div className="dropdown-bottom w-full dropdown dropdown-end">
                <div
                    tabIndex={0}
                    role="button"
                    className="flex items-center gap-2.5 bg-base-200 hover:bg-base-300 mx-2.5 mt-1 px-3 py-2 rounded-box transition-all cursor-pointer"
                >
                    <div className="flex justify-center items-center bg-primary/20 rounded-box size-8">
                        <div className="bg-primary size-5 mask mask-hexagon-2"></div>
                    </div>
                    <div className="-space-y-0.5 grow">
                        <p
                            className="font-medium text-sm truncate"
                            title={config.activeProjectName || "Select project"}
                        >
                            {config.activeProjectName || "Select project"}
                        </p>
                        <p className="text-xs text-base-content/60">
                            {config.activeProjectId ? "Active" : "No project selected"}
                        </p>
                    </div>
                    <Icon icon="lucide--chevrons-up-down" className="size-4 text-base-content/60" />
                </div>
                <div
                    tabIndex={0}
                    className="bg-base-100 shadow-[0px_10px_40px_0px] shadow-base-content/10 mt-1 p-0 rounded-box w-60 dropdown-content"
                >
                    <ul className="space-y-1 p-2 w-full max-h-72 overflow-auto menu">
                        {loading && (
                            <li className="disabled">
                                <div className="flex items-center gap-2">
                                    <span className="rounded w-4 h-4 skeleton" />
                                    <span className="w-28 h-3 skeleton" />
                                </div>
                            </li>
                        )}
                        {!loading && projects && projects.length === 0 && (
                            <li className="disabled">
                                <div className="opacity-70">No projects</div>
                            </li>
                        )}
                        {!loading &&
                            projects?.map((p) => (
                                <li key={p.id}>
                                    <button
                                        className="flex justify-between items-center"
                                        onClick={() => setActiveProject(p.id, p.name)}
                                        aria-current={p.id === config.activeProjectId ? "true" : undefined}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="flex justify-center items-center bg-secondary/20 rounded-box size-8">
                                                <div className="bg-secondary size-5 mask mask-star-2"></div>
                                            </div>
                                            <div className="text-left">
                                                <p className="font-medium text-sm truncate" title={p.name}>
                                                    {p.name}
                                                </p>
                                                {p.status && (
                                                    <p className="opacity-60 mt-0.5 text-xs truncate" title={p.status}>
                                                        {p.status}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {p.id === config.activeProjectId && <Icon icon="lucide--check" className="size-4" />}
                                    </button>
                                </li>
                            ))}
                    </ul>
                    <div className="px-2 pt-0 pb-2">
                        <label htmlFor="modal-create-project" className="link link-primary">
                            Add project
                        </label>
                    </div>
                </div>
            </div>

            <CreateProjectModal
                onCreated={(proj) => setActiveProject(proj.id, proj.name)}
                errorMsg={error}
                onCreate={createProject}
            />
        </>
    );
};

type CreateProjectModalProps = {
    onCreate: (name: string) => Promise<{ id: string; name: string }>;
    onCreated: (proj: { id: string; name: string }) => void;
    errorMsg?: string;
};

const CreateProjectModal = ({ onCreate, onCreated, errorMsg }: CreateProjectModalProps) => {
    const [name, setName] = useState<string>("");
    const [creating, setCreating] = useState<boolean>(false);
    const [localError, setLocalError] = useState<string | undefined>(undefined);
    const [toastMsg, setToastMsg] = useState<string | undefined>(undefined);

    const submit = async () => {
        if (!name.trim()) return;
        try {
            setCreating(true);
            setLocalError(undefined);
            const created = await onCreate(name.trim());
            onCreated(created);
            setName("");
            (document.getElementById("modal-create-project") as HTMLInputElement | null)?.click?.();
            setToastMsg(`Project “${created.name}” created`);
            window.setTimeout(() => setToastMsg(undefined), 2500);
        } catch (e) {
            setLocalError((e as Error).message || "Failed to create project");
        } finally {
            setCreating(false);
        }
    };

    return (
        <>
            <input type="checkbox" id="modal-create-project" className="modal-toggle" />
            <div className="modal" role="dialog" aria-modal="true">
                <div className="modal-box">
                    <h3 className="font-bold text-lg">Create Project</h3>
                    {(errorMsg || localError) && (
                        <div className="mt-2 alert alert-error">
                            <Icon icon="lucide--alert-triangle" className="size-4" />
                            <span>{localError || errorMsg}</span>
                        </div>
                    )}
                    <div className="mt-4 form-control">
                        <label className="label">
                            <span className="label-text">Project name</span>
                        </label>
                        <input
                            className="input"
                            placeholder="Design System"
                            value={name}
                            maxLength={100}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="modal-action">
                        <label htmlFor="modal-create-project" className="btn btn-ghost">
                            Cancel
                        </label>
                        <button className="btn btn-primary" onClick={submit} disabled={creating || !name.trim()}>
                            {creating && <span className="me-2 loading loading-spinner loading-sm" />}Create
                        </button>
                    </div>
                </div>
                <label className="modal-backdrop" htmlFor="modal-create-project">
                    Close
                </label>
            </div>
            {toastMsg && (
                <div className="toast-top toast toast-end">
                    <div className="alert alert-success">
                        <Icon icon="lucide--check-circle-2" className="size-4" />
                        <span>{toastMsg}</span>
                    </div>
                </div>
            )}
        </>
    );
};

export default SidebarProjectDropdown;
