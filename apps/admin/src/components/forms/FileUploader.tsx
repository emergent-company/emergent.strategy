import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.min.css";
import "filepond/dist/filepond.css";
import { FilePond, FilePondProps, registerPlugin } from "react-filepond";

registerPlugin(FilePondPluginImagePreview);

export const FileUploader = ({ credits = false, server, ...others }: FilePondProps) => {
    return (
        <FilePond
            credits={credits}
            {...others}
            server={
                typeof server == "string"
                    ? server
                    : {
                          ...server,
                          process: (_, __, ___, load) => load({ message: "done" }),
                      }
            }
        />
    );
};
