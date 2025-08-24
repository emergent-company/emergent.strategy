import { ColumnDef, flexRender, getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import React from "react";

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
    {
        accessorKey: "actions",
        header: "Actions",
    },
];

const data = getTableData().slice(0, 5);

export const RowActionsDemo = () => {
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
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
                                        {cell.column.id == "actions" ? (
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    className="btn btn-soft btn-xs btn-square"
                                                    onClick={() => alert(`View #${cell.row.original.id}`)}
                                                    aria-label="Show">
                                                    <span className="iconify lucide--eye size-3.5"></span>
                                                </button>
                                                <button
                                                    className="btn btn-soft btn-error btn-xs btn-square"
                                                    onClick={() => alert(`Delete #${cell.row.original.id}`)}
                                                    aria-label="Delete">
                                                    <span className="iconify lucide--trash-2 size-3.5"></span>
                                                </button>
                                            </div>
                                        ) : (
                                            <RenderCell cell={cell} />
                                        )}
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
