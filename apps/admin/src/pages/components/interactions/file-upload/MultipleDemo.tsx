import "filepond/dist/filepond.css";
import { FilePond, FilePondProps } from "react-filepond";

export const MultipleDemo = () => {
    const options: FilePondProps = {
        credits: false,
        allowMultiple: true,
        server: {
            process: (_, __, ___, load) => load({ message: "done" }),
        },
    };

    return <FilePond {...options} />;
};
