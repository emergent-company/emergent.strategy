import { IAiLibraryItem } from "./helpers";

export const AiLibraryTableRow = ({ id, image, tokens, type, title, content, user }: IAiLibraryItem) => {
    return (
        <>
            <tr className="hover:bg-base-200/40 cursor-pointer *:text-nowrap">
                <th>
                    <input aria-label="Single check" type="checkbox" className="checkbox checkbox-sm" />
                </th>
                <td className="font-medium">{id}</td>
                <td>
                    <div className="flex items-center space-x-3 truncate">
                        <img
                            src={image}
                            height={40}
                            width={40}
                            className="bg-base-200 mask mask-squircle size-10"
                            alt="Library Image"
                        />
                        <p className="font-medium">{user}</p>
                    </div>
                </td>
                <td>
                    <div className="inline-flex items-center gap-1.5">
                        {type == "image" ? (
                            <>
                                <span className="iconify lucide--image size-4" />
                                Image
                            </>
                        ) : type == "code" ? (
                            <>
                                <span className="iconify lucide--code size-4" />
                                Code
                            </>
                        ) : (
                            <>
                                <span className="iconify lucide--text size-4" />
                                Text
                            </>
                        )}
                    </div>
                </td>
                <td>
                    <p className="text-nowrap">{title}</p>
                </td>
                <td>
                    <p className="line-clamp-2 max-w-80 min-w-48 text-ellipsis">{content}</p>
                </td>
                <td className="text-sm font-medium">{tokens}</td>
                <td>
                    <div className="inline-flex">
                        <button aria-label="Edit Library" className="btn btn-square btn-ghost btn-sm">
                            <span className="iconify lucide--pencil size-4" />
                        </button>
                        <button aria-label="Show Library" className="btn btn-square btn-ghost btn-sm">
                            <span className="iconify lucide--eye size-4" />
                        </button>
                        <button
                            aria-label="Dummy delete customer"
                            className="btn btn-square btn-error btn-outline btn-sm border-transparent"
                            onClick={() =>
                                document.querySelector<HTMLDialogElement>("#apps-ai-library-delete")?.showModal()
                            }>
                            <span className="iconify lucide--trash size-4" />
                        </button>
                    </div>
                </td>
            </tr>
        </>
    );
};
