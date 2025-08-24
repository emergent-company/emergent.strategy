import { ColumnDef, flexRender, getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import { type PaginationState } from "@tanstack/table-core";
import React, { useMemo, useState } from "react";

import { RenderCell } from "./RenderCell";
import { ITableData, getTableData } from "./helper";

export const columns: ColumnDef<ITableData>[] = [
    {
        accessorKey: "id",
        header: "ID",
    },
    {
        accessorKey: "customerName",
        header: "Customer",
    },

    {
        accessorKey: "status",
        header: "Status",
    },
    {
        accessorKey: "amount",
        header: "Amount",
    },
    {
        accessorKey: "dateTime",
        header: "Order At",
    },
];

const data = getTableData().slice(0, 25);

export const PaginationDemo = () => {
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 5,
    });

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onPaginationChange: setPagination,
        state: {
            pagination,
        },
    });

    const [start, end, rowCount] = useMemo(() => {
        const rowCount = table.getFilteredRowModel().rows.length;
        const pageSize = table.getState().pagination.pageSize;
        const pageIndex = table.getState().pagination.pageIndex;

        const start = pageIndex * pageSize + 1;
        const end = Math.min(start + pageSize - 1, rowCount);

        return [start, end, rowCount];
    }, [table]);

    return (
        <div>
            <div className="overflow-x-auto">
                <table className="table">
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <th key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(header.column.columnDef.header, header.getContext())}
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <tr key={row.id} data-state={row.getIsSelected() && "selected"}>
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id}>
                                            <RenderCell cell={cell} />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length} className="h-24 text-center">
                                    No results.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="border-base-200 flex flex-wrap items-center justify-between gap-2 border-t border-dashed p-5">
                <div className="flex items-center gap-2">
                    <p className="text-base-content/70 text-sm max-md:hidden">Items per page</p>
                    <select
                        className="select select-sm w-16"
                        value={pagination.pageSize}
                        onChange={(e) => {
                            setPagination({ ...pagination, pageSize: parseInt(e.target.value) });
                        }}
                        aria-label="Items per page">
                        {[5, 10, 20, 50].map((pageSize) => {
                            return (
                                <option key={pageSize} value={pageSize}>
                                    {pageSize}
                                </option>
                            );
                        })}
                    </select>
                </div>
                <p className="text-base-content/70 text-sm max-md:hidden">
                    Showing{" "}
                    <span className="text-base-content font-medium">
                        {start}–{end}
                    </span>{" "}
                    out of <span className="text-base-content font-medium">{rowCount}</span>
                </p>
                <div className="join">
                    <button
                        className="btn btn-square btn-sm btn-outline border-base-300 join-item"
                        aria-label="Pagination controls"
                        disabled={!table.getCanPreviousPage()}
                        onClick={() => table.previousPage()}>
                        <span className="iconify lucide--arrow-left" />
                    </button>
                    {Array.from({ length: table.getPageCount() }).map((_, i) => {
                        return (
                            <button
                                key={i}
                                onClick={() => setPagination({ ...pagination, pageIndex: i })}
                                className={`btn btn-square btn-sm btn-outline border-base-300 join-item ${pagination.pageIndex == i ? "btn-active" : ""}`}>
                                {i + 1}
                            </button>
                        );
                    })}
                    <button
                        className="btn btn-square btn-sm btn-outline border-base-300 join-item"
                        aria-label="Pagination controls"
                        disabled={!table.getCanNextPage()}
                        onClick={() => table.nextPage()}>
                        <span className="iconify lucide--arrow-right" />
                    </button>
                </div>
            </div>
        </div>
    );
};
