import { ColumnDef, flexRender, getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
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

const data = getTableData().slice(0, 5);

export const RowSelectionDemo = () => {
    const [rowSelection, setRowSelection] = useState({});

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        state: {
            rowSelection,
        },
        onRowSelectionChange: setRowSelection,
    });

    const [selectedCount, totalCount] = useMemo(() => {
        const selected = table.getSelectedRowModel().rows.length;
        const total = table.getFilteredRowModel().rows.length;
        return [selected, total];
    }, [table]);

    return (
        <div>
            <div className="border-base-200 border-b border-dashed p-5">
                <div className="text-base-content/70 text-center text-sm">
                    {selectedCount > 0 ? (
                        <p>
                            <span className="text-base-content font-medium">{selectedCount}</span> row
                            {selectedCount > 1 ? "s" : ""} selected out of{" "}
                            <span className="text-base-content font-medium">{totalCount}</span>
                        </p>
                    ) : (
                        <span className="font-medium">Select a row</span>
                    )}
                </div>
            </div>
            <div className="overflow-x-auto py-1">
                <table className="table">
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                <th>
                                    <input
                                        aria-label="Select all"
                                        type="checkbox"
                                        ref={(el) => {
                                            if (el) {
                                                el.indeterminate =
                                                    table.getIsSomePageRowsSelected() &&
                                                    !table.getIsAllPageRowsSelected();
                                            }
                                        }}
                                        checked={table.getIsAllPageRowsSelected()}
                                        onChange={() => table.toggleAllPageRowsSelected()}
                                        className="checkbox checkbox-sm"
                                    />
                                </th>
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
                                    <td>
                                        <input
                                            aria-label="Select row"
                                            type="checkbox"
                                            checked={row.getIsSelected()}
                                            onChange={() => row.toggleSelected()}
                                            className="checkbox checkbox-sm"
                                        />
                                    </td>
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
