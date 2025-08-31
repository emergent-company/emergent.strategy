import { IAiLibraryItem } from "./helpers";
import { Icon } from "@/components/ui/Icon";

export const AiLibraryTableRow = ({ id, image, tokens, type, title, content, user }: IAiLibraryItem) => {
    return (
        <>
            <tr className="hover:bg-base-200/40 *:text-nowrap cursor-pointer">
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
                            className="bg-base-200 size-10 mask mask-squircle"
                            alt="Library Image"
                        />
                        <p className="font-medium">{user}</p>
                    </div>
                </td>
                <td>
                    <div className="inline-flex items-center gap-1.5">
                        {type == "image" ? (
                            <>
                                <Icon icon="lucide--image" className="size-4" />
                                Image
                            </>
                        ) : type == "code" ? (
                            <>
                                <Icon icon="lucide--code" className="size-4" />
                                Code
                            </>
                        ) : (
                            <>
                                <Icon icon="lucide--text" className="size-4" />
                                Text
                            </>
                        )}
                    </div>
                </td>
                <td>
                    <p className="text-nowrap">{title}</p>
                </td>
                <td>
                    <p className="min-w-48 max-w-80 text-ellipsis line-clamp-2">{content}</p>
                </td>
                <td className="font-medium text-sm">{tokens}</td>
                <td>
                    <div className="inline-flex">
                        <button aria-label="Edit Library" className="btn btn-square btn-ghost btn-sm">
                            <Icon icon="lucide--pencil" className="size-4" />
                        </button>
                        <button aria-label="Show Library" className="btn btn-square btn-ghost btn-sm">
                            <Icon icon="lucide--eye" className="size-4" />
                        </button>
                        <button
                            aria-label="Dummy delete customer"
                            className="border-transparent btn-outline btn btn-square btn-error btn-sm"
                            onClick={() =>
                                document.querySelector<HTMLDialogElement>("#apps-ai-library-delete")?.showModal()
                            }>
                            <Icon icon="lucide--trash" className="size-4" />
                        </button>
                    </div>
                </td>
            </tr>
        </>
    );
};
