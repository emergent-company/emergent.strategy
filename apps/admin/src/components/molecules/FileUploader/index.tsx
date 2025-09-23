import React from 'react'
import FilePondPluginImagePreview from 'filepond-plugin-image-preview'
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.min.css'
import 'filepond/dist/filepond.css'
import { FilePond, type FilePondProps, registerPlugin } from 'react-filepond'

// Register preview plugin once at module load
registerPlugin(FilePondPluginImagePreview)

/**
 * FileUploader Molecule
 * Thin typed wrapper around FilePond to ensure consistent defaults & future extension point.
 * Classification: Molecule (integrates 3rd‑party widget + config shaping).
 */
export interface FileUploaderProps extends FilePondProps {
    /** Show FilePond credits footer. Defaults to false for cleaner admin UI. */
    credits?: FilePondProps['credits']
}

export const FileUploader: React.FC<FileUploaderProps> = ({ credits = false, server, ...others }) => {
    return (
        <FilePond
            credits={credits}
            {...others}
            // Provide a harmless default process implementation when an object server config is supplied
            server={
                typeof server === 'string'
                    ? server
                    : server
                        ? {
                            ...server,
                            process: server.process || ((_, __, ___, load) => load({ message: 'done' } as any)),
                        }
                        : undefined
            }
        />
    )
}

export default FileUploader
