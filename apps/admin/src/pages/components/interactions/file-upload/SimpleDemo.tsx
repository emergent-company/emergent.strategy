import "filepond/dist/filepond.css";
import { FilePond, type FilePondProps } from "react-filepond";

export const SimpleDemo = () => {
    const options: FilePondProps = {
        allowImagePreview: false,
        credits: false,
        server: {
            process: (_, __, ___, load) => load({ message: "done" }),
        },
    };

    return <FilePond {...options} />;
};
