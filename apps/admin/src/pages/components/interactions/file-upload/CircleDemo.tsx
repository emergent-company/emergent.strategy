import "filepond/dist/filepond.css";
import { FilePond, FilePondProps } from "react-filepond";

export const CircleDemo = () => {
    const options: FilePondProps = {
        credits: false,
        stylePanelAspectRatio: "1:1",
        stylePanelLayout: "compact circle",
        server: {
            process: (_, __, ___, load) => load({ message: "done" }),
        },
    };

    return (
        <div className="size-60 overflow-hidden rounded-full">
            <FilePond {...options} />
        </div>
    );
};
