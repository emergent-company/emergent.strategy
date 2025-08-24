import {
    ColumnDef,
    SortingState,
    VisibilityState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
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
    {
        accessorKey: "actions",
        header: "Actions",
    },
];

const data = getTableData();

export const AdvancedDemo = () => {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = useState("");
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = useState({});
    const [pagination, setPagination] = useState({
        pageIndex: 0,
        pageSize: 10,
    });

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
        onPaginationChange: setPagination,
        state: {
            pagination,
            sorting,
            globalFilter,
            columnVisibility,
            rowSelection,
        },
        onRowSelectionChange: setRowSelection,
        getFilteredRowModel: getFilteredRowModel(),
        onGlobalFilterChange: setGlobalFilter,
        onColumnVisibilityChange: setColumnVisibility,
    });

    const [start, end, rowCount] = useMemo(() => {
        const rowCount = table.getFilteredRowModel().rows.length;
        const pageSize = table.getState().pagination.pageSize;
        const pageIndex = table.getState().pagination.pageIndex;

        const start = pageIndex * pageSize + 1;
        const end = Math.min(start + pageSize - 1, rowCount);

        return [start, end, rowCount];
    }, [table]);

    const [selectedCount, totalCount] = useMemo(() => {
        const selected = table.getSelectedRowModel().rows.length;
        const total = table.getFilteredRowModel().rows.length;
        return [selected, total];
    }, [table]);

    const clearFilters = () => {
        setSorting([]);
        setGlobalFilter("");
        setColumnVisibility({});
        setRowSelection({});
        setPagination({
            pageIndex: 0,
            pageSize: 10,
        });
    };

    return (
        <div>
            <div className="border-base-200 flex items-center justify-between border-b border-dashed px-5 py-5">
                <label className="input input-sm w-36 md:w-44">
                    <span className="iconify lucide--search text-base-content/70 size-4.5"></span>
                    <input
                        className="text-base placeholder:text-sm"
                        type="search"
                        placeholder="Search by all fields"
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                    />
                </label>
                <div className="text-base-content/70 text-center text-sm max-md:hidden">
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
                <div className="flex items-center gap-2">
                    <div className="dropdown dropdown-bottom dropdown-end">
                        <div
                            tabIndex={0}
                            role="button"
                            className="btn btn-outline btn-sm border-base-300 max-sm:btn-square">
                            <span className="iconify lucide--columns-3-cog size-4"></span>
                            <span className="max-sm:hidden">Columns</span>
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
                    <div className="dropdown dropdown-bottom dropdown-end">
                        <div
                            tabIndex={0}
                            role="button"
                            className="btn btn-outline btn-sm btn-square border-base-300"
                            aria-label="Actions">
                            <span className="iconify lucide--ellipsis-vertical size-4"></span>
                        </div>

                        <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box w-44 shadow">
                            <ul className="menu w-full">
                                <li>
                                    <div>
                                        <span className="iconify lucide--refresh-cw size-4"></span>
                                        Refresh Data
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <span className="iconify lucide--calendar-range size-4"></span>
                                        Filter by Date
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <span className="iconify lucide--download size-4"></span>
                                        Export Rows
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <span className="iconify lucide--pie-chart size-4"></span>
                                        Report
                                    </div>
                                </li>
                                <li>
                                    <div>
                                        <span className="iconify lucide--clock size-4"></span>
                                        Recent Activity
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            <div className="overflow-x-auto py-1">
                <table className="table">
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                <th>
                                    <input
                                        aria-label="Select all rows"
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
                                            <div
                                                className="group flex cursor-pointer items-center justify-between"
                                                data-sorting={header.column.getIsSorted()}
                                                onClick={() =>
                                                    header.column.toggleSorting(header.column.getIsSorted() === "asc")
                                                }>
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(header.column.columnDef.header, header.getContext())}
                                                {header.column.id !== "actions" && (
                                                    <div className="flex flex-col items-center justify-center -space-y-1.5">
                                                        <span className="iconify lucide--chevron-up text-base-content size-3 opacity-40 group-data-[sorting=asc]:opacity-100"></span>
                                                        <span className="iconify lucide--chevron-down text-base-content size-3 opacity-40 group-data-[sorting=desc]:opacity-100"></span>
                                                    </div>
                                                )}
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
                                <td
                                    colSpan={columns.length + 1}
                                    className="text-base-content/60 h-40 text-center text-base font-medium">
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
            <div className="border-base-200 flex flex-wrap items-center justify-between gap-3 border-t border-dashed p-5">
                <div className="flex items-center gap-2">
                    <p className="text-base-content/70 text-sm max-md:hidden">Items per page</p>
                    <select
                        aria-label="Items per page"
                        className="select select-sm w-16"
                        value={pagination.pageSize}
                        onChange={(e) => {
                            setPagination({ ...pagination, pageSize: parseInt(e.target.value) });
                        }}>
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
                        className="btn btn-sm btn-outline border-base-300 join-item"
                        aria-label="Pagination controls"
                        onClick={() => table.previousPage()}>
                        <span className="iconify lucide--arrow-left" />
                        Prev
                    </button>
                    <input
                        aria-label="Page"
                        min={1}
                        max={table.getPageCount()}
                        type="number"
                        value={pagination.pageIndex + 1}
                        onChange={(e) => setPagination({ ...pagination, pageIndex: parseInt(e.target.value) - 1 })}
                        className="input input-sm join-item w-10 text-center"
                    />
                    <button
                        className="btn btn-sm btn-outline border-base-300 join-item"
                        aria-label="Pagination controls"
                        disabled={!table.getCanNextPage()}
                        onClick={() => table.nextPage()}>
                        Next
                        <span className="iconify lucide--arrow-right" />
                    </button>
                </div>
            </div>
        </div>
    );
};
