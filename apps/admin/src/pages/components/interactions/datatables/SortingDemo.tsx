import {
    ColumnDef,
    SortingState,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import React, { useState } from "react";

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

const data = getTableData().slice(0, 5);

export const SortingDemo = () => {
    const [sorting, setSorting] = useState<SortingState>([]);

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        state: {
            sorting,
        },
    });

    return (
        <div className="overflow-x-auto">
            <table className="table">
                <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => {
                                return (
                                    <th key={header.id}>
                                        <div
                                            className="group flex cursor-pointer items-center justify-between"
                                            data-sorting={header.column.getIsSorted()}
                                            onClick={() =>
                                                header.column.toggleSorting(header.column.getIsSorted() === "asc")
                                            }>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(header.column.columnDef.header, header.getContext())}
                                            <div className="flex flex-col items-center justify-center -space-y-1.5">
                                                <span className="iconify lucide--chevron-up text-base-content size-3.5 opacity-40 group-data-[sorting=asc]:opacity-100"></span>
                                                <span className="iconify lucide--chevron-down text-base-content size-3.5 opacity-40 group-data-[sorting=desc]:opacity-100"></span>
                                            </div>
                                        </div>
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
    );
};
