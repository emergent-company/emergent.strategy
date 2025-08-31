import { Icon } from "@/components/ui/Icon";

const content =
    "Join [Company Name] as a UI Designer and craft user-friendly, visually stunning interfaces. Collaborate with...";

export const ContentCreationForm = () => {
    return (
        <div className="space-y-6">
            <div className="bg-base-100 card-border card">
                <div className="card-body">
                    <div className="card-title">Information</div>
                    <div className="gap-4 mt-2 fieldset">
                        <div className="space-y-2">
                            <label className="fieldset-label" htmlFor="content">
                                Content
                            </label>
                            <textarea
                                className="pb-0 w-full h-36 leading-5 textarea"
                                placeholder={content}
                                id="content"
                                aria-label="Textarea"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="fieldset-label" htmlFor="keywords">
                                Keywords are included
                            </label>
                            <input
                                className="w-full input"
                                id="keywords"
                                placeholder="react, dashboard, nextjs, ...."
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-base-100 card-border card">
                <div className="card-body">
                    <div className="card-title">Language options</div>
                    <div className="bg-success/5 my-2.5 p-3 border border-success/20 rounded-box text-sm">
                        <span className="font-medium">Beta:</span> This feature is currently accessible to a limited
                        group of beta users.
                    </div>
                    <div className="fieldset">
                        <div className="flex gap-4">
                            <div className="space-y-2 grow">
                                <label className="fieldset-label" htmlFor="voice-tone">
                                    Voice Tone
                                </label>
                                <select className="w-full select" defaultValue="" id="voice-tone">
                                    <option>Formal</option>
                                    <option>Casual</option>
                                    <option>Persuasive</option>
                                    <option>Friendly</option>
                                    <option>Neutral</option>
                                </select>
                            </div>
                            <div className="space-y-2 grow">
                                <label className="fieldset-label" htmlFor="creative">
                                    How creative it be
                                </label>
                                <input
                                    className="focus:outline-0 w-full input"
                                    id="creative"
                                    min="0"
                                    step="0.1"
                                    max="1"
                                    defaultValue="0.6"
                                    type="number"
                                    placeholder="0.6"
                                />
                            </div>
                        </div>
                        <div className="flex items-end gap-4 mt-2">
                            <div className="space-y-2 grow">
                                <label className="fieldset-label" htmlFor="input-voice">
                                    Input Voice
                                </label>
                                <select className="w-full select" defaultValue="en" id="input-voice">
                                    <option value="en">English</option>
                                    <option value="es">Spanish</option>
                                    <option value="fr">French</option>
                                    <option value="de">German</option>
                                    <option value="it">Italian</option>
                                </select>
                            </div>
                            <button className="mb-1 btn btn-sm btn-circle" aria-label="Swap input/output voice">
                                <Icon icon="lucide--arrow-left-right" className="size-4" />
                            </button>
                            <div className="space-y-2 grow">
                                <label className="fieldset-label" htmlFor="output-voice">
                                    Output Voice
                                </label>
                                <select className="w-full select" defaultValue="fr" id="output-voice">
                                    <option value="en">English</option>
                                    <option value="es">Spanish</option>
                                    <option value="fr">French</option>
                                    <option value="de">German</option>
                                    <option value="it">Italian</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-5">
                        <button className="btn btn-ghost btn-sm" disabled>
                            Stop
                        </button>
                        <button className="btn btn-sm btn-primary">
                            <Icon icon="lucide--wand-2" className="size-3.5" />
                            Generate
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
