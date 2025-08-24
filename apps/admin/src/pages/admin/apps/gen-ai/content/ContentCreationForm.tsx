const content =
    "Join [Company Name] as a UI Designer and craft user-friendly, visually stunning interfaces. Collaborate with...";

export const ContentCreationForm = () => {
    return (
        <div className="space-y-6">
            <div className="card bg-base-100 card-border">
                <div className="card-body">
                    <div className="card-title">Information</div>
                    <div className="fieldset mt-2 gap-4">
                        <div className="space-y-2">
                            <label className="fieldset-label" htmlFor="content">
                                Content
                            </label>
                            <textarea
                                className="textarea h-36 w-full pb-0 leading-5"
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
                                className="input w-full"
                                id="keywords"
                                placeholder="react, dashboard, nextjs, ...."
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="card bg-base-100 card-border">
                <div className="card-body">
                    <div className="card-title">Language options</div>
                    <div className="border-success/20 bg-success/5 rounded-box my-2.5 border p-3 text-sm">
                        <span className="font-medium">Beta:</span> This feature is currently accessible to a limited
                        group of beta users.
                    </div>
                    <div className="fieldset">
                        <div className="flex gap-4">
                            <div className="grow space-y-2">
                                <label className="fieldset-label" htmlFor="voice-tone">
                                    Voice Tone
                                </label>
                                <select className="select w-full" defaultValue="" id="voice-tone">
                                    <option>Formal</option>
                                    <option>Casual</option>
                                    <option>Persuasive</option>
                                    <option>Friendly</option>
                                    <option>Neutral</option>
                                </select>
                            </div>
                            <div className="grow space-y-2">
                                <label className="fieldset-label" htmlFor="creative">
                                    How creative it be
                                </label>
                                <input
                                    className="input w-full focus:outline-0"
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
                        <div className="mt-2 flex items-end gap-4">
                            <div className="grow space-y-2">
                                <label className="fieldset-label" htmlFor="input-voice">
                                    Input Voice
                                </label>
                                <select className="select w-full" defaultValue="en" id="input-voice">
                                    <option value="en">English</option>
                                    <option value="es">Spanish</option>
                                    <option value="fr">French</option>
                                    <option value="de">German</option>
                                    <option value="it">Italian</option>
                                </select>
                            </div>
                            <button className="btn btn-sm btn-circle mb-1">
                                <span className="iconify lucide--arrow-left-right size-4"></span>
                            </button>
                            <div className="grow space-y-2">
                                <label className="fieldset-label" htmlFor="output-voice">
                                    Output Voice
                                </label>
                                <select className="select w-full" defaultValue="fr" id="output-voice">
                                    <option value="en">English</option>
                                    <option value="es">Spanish</option>
                                    <option value="fr">French</option>
                                    <option value="de">German</option>
                                    <option value="it">Italian</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 flex justify-end gap-3">
                        <button className="btn btn-ghost btn-sm" disabled>
                            Stop
                        </button>
                        <button className="btn btn-sm btn-primary">
                            <span className="iconify lucide--wand-2 size-3.5" />
                            Generate
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
