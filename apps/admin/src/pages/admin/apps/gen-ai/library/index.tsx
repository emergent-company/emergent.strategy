import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { AiLibraryTable } from "./LibraryTable";

const AiLibraryPage = () => {
    return (
        <>
            <MetaData title="AI Library" />
            <PageTitle title="Library" items={[{ label: "Gen Ai" }, { label: "Library", active: true }]} />
            <div className="mt-6">
                <AiLibraryTable />
            </div>
        </>
    );
};

export default AiLibraryPage;
