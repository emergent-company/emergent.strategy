import {
    ColumnDef,
    VisibilityState,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
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

export const ColumnVisibilityDemo = () => {
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onColumnVisibilityChange: setColumnVisibility,
        state: {
            columnVisibility,
        },
    });

    return (
        <div>
            <div className="border-base-200 flex justify-end border-b border-dashed p-5">
                <div className="dropdown dropdown-bottom dropdown-end">
                    <div tabIndex={0} role="button" className="btn btn-outline btn-sm border-base-300">
                        <span className="iconify lucide--columns-3-cog size-4"></span>
                        Columns
                    </div>
                    <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box w-44 shadow">
                        <ul className="menu w-full">
                            {table.getAllLeafColumns().map((column) => (
                                <li onClick={column.getToggleVisibilityHandler()} key={column.id}>
                                    <div
                                        data-visible={column.getIsVisible() ? true : undefined}
                                        className="group gap-2.5">
                                        <span className="iconify lucide--check size-4 scale-50 opacity-0 transition-all duration-300 group-data-visible:scale-100 group-data-visible:opacity-100"></span>
                                        <span className="font-medium">{column.columnDef.header as string}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            <div className="overflow-x-auto py-1">
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
        </div>
    );
};
