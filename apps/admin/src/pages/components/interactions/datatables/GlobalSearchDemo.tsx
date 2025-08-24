import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
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

export const GlobalSearchDemo = () => {
    const [globalFilter, setGlobalFilter] = useState("");

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onGlobalFilterChange: setGlobalFilter,
        state: {
            globalFilter,
        },
    });

    const clearFilters = () => {
        setGlobalFilter("");
    };

    return (
        <div>
            <div className="border-base-200 border-b border-dashed p-5">
                <label className="input input-sm w-56">
                    <span className="iconify lucide--search text-base-content/70 size-4.5"></span>
                    <input
                        className="text-base placeholder:text-sm"
                        type="search"
                        placeholder="Search by all fields"
                        value={globalFilter}
                        onChange={(e) => table.setGlobalFilter(String(e.target.value))}
                    />
                </label>
            </div>
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
                                <td
                                    colSpan={columns.length}
                                    className="text-base-content/60 h-32 text-center text-base font-medium">
                                    <p className="text-sm text-gray-600">
                                        No results found.{" "}
                                        <span
                                            onClick={clearFilters}
                                            className="text-primary cursor-pointer hover:underline">
                                            Clear filters
                                        </span>
                                    </p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
