import { useState } from "react";

export type IQuickIntegrationItem = {
    image: string;
    name: string;
    description: string;
    isConnected: boolean;
};

export const QuickIntegrationItem = ({ name, image, description, isConnected }: IQuickIntegrationItem) => {
    const [connected, setConnected] = useState(isConnected);

    return (
        <div className="flex items-center gap-3">
            <img src={image} alt="chat" className="bg-base-200 mask mask-squircle size-11 p-2" />
            <div className="grow">
                <p className="leading-none font-medium">{name}</p>
                <p className="text-base-content/80 line-clamp-1 text-sm">{description}</p>
            </div>
            <button
                className={`btn btn-xs btn-soft ${connected ? "btn-primary" : "btn-error"}`}
                onClick={() => setConnected(!connected)}>
                {connected ? "Disconnect" : "Connect"}
            </button>
        </div>
    );
};
