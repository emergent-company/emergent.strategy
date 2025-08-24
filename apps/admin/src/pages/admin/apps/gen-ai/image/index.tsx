import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { GeneratedImages } from "./GeneratedImages";
import { ImageCreationForm } from "./ImageCreationForm";

const AiChatPage = () => {
    return (
        <>
            <MetaData title="AI Image Gen" />

            <PageTitle title="Image Gen" items={[{ label: "Gen Ai" }, { label: "Image Gen", active: true }]} />

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5 2xl:grid-cols-10">
                <div className="xl:col-span-2 2xl:col-span-3">
                    <ImageCreationForm />
                </div>
                <div className="xl:col-span-3 2xl:col-span-7">
                    <GeneratedImages />
                </div>
            </div>
        </>
    );
};

export default AiChatPage;
