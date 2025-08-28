import React from "react";

export type TableEmptyStateProps = {
    colSpan: number;
    message?: string;
    className?: string;
    "data-testid"?: string;
};

export function TableEmptyState({
    colSpan,
    message = "No results.",
    className,
    "data-testid": dataTestId,
}: TableEmptyStateProps): React.ReactElement {
    return (
        <tr data-testid={dataTestId}>
            <td colSpan={colSpan} className={"opacity-70 py-8 text-center" + (className ? ` ${className}` : "")}>
                {message}
            </td>
        </tr>
    );
}

export default TableEmptyState;
