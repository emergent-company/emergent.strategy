import { Cell, flexRender } from "@tanstack/react-table";
import React from "react";

import { ITableData } from "./helper";

export const RenderCell = ({ cell }: { cell: Cell<ITableData, unknown> }) => {
    const { avatar, status, customerName, id, dateTime, amount, email } = cell.row.original;
    switch (cell.column.id) {
        case "id":
            return <span className="text-base-content/70 font-mono text-xs uppercase">#{id}</span>;
        case "customerName":
            return (
                <div className="flex items-center gap-2">
                    <div className="avatar">
                        <div className="mask bg-base-200 mask-squircle h-9 w-9 px-0.5 pt-0.5">
                            <img src={avatar} alt="Avatar" />
                        </div>
                    </div>
                    <div>
                        <p className="leading-none font-medium">{customerName}</p>
                        <p className="text-base-content/70 mt-0.5 text-xs/none">{email}</p>
                    </div>
                </div>
            );
        case "status":
            return status == "success" ? (
                <div className="badge badge-success badge-sm badge-soft">Success</div>
            ) : status == "processing" ? (
                <div className="badge badge-sm badge-info badge-soft">Processing</div>
            ) : status == "failed" ? (
                <div className="badge badge-error badge-sm badge-soft">Failed</div>
            ) : (
                <div className="badge badge-sm badge-ghost">Pending</div>
            );
        case "dateTime":
            return (
                <p className="space-x-1 whitespace-nowrap">
                    <span>
                        {new Date(dateTime).toLocaleDateString("en-US", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                        })}
                    </span>
                    <span className="text-base-content/60 text-xs">
                        {new Date(dateTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                </p>
            );
        case "amount":
            return <span className="text-base font-medium">${amount}</span>;
        default:
            return flexRender(cell.column.columnDef.cell, cell.getContext());
    }
};
