import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { AdvancedDemo } from "./AdvancedDemo";
import { ColumnSearchDemo } from "./ColumnSearchDemo";
import { ColumnVisibilityDemo } from "./ColumnVisibilityDemo";
import { GlobalSearchDemo } from "./GlobalSearchDemo";
import { PaginationDemo } from "./PaginationDemo";
import { RowActionsDemo } from "./RowActionsDemo";
import { RowSelectionDemo } from "./RowSelectionDemo";
import { ScrollableDemo } from "./ScrollableDemo";
import { SimpleDemo } from "./SimpleDemo";
import { SortingDemo } from "./SortingDemo";

const DataTablesPage = () => {
    return (
        <div>
            <MetaData title="Datatables" />
            <ComponentPageTitle
                label="Interactions"
                title="Data Tables"
                description="Powerful data tables with sorting, search, pagination, column control, and row actions"
            />
            <div className="bg-base-200/40 rounded-box mt-6 px-5 py-4 lg:mt-12">
                <p className="text-base-content/60 font-medium">Usage guidelines</p>
                <p className="mt-1">
                    <span className="me-1">- Plugin Documentation:</span>
                    <Link to="https://tanstack.com/table" target="_blank" className="text-primary">
                        Tanstack Table
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-8 font-medium">Complete Actions</p>
            <div className="mt-4 lg:mt-6">
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box flex flex-wrap items-center justify-between space-x-2 px-5 py-4">
                        <p className="font-medium">Recent Orders</p>
                        <p className="text-base-content/50 text-xs italic">Synced 20 min ago</p>
                    </div>
                    <AdvancedDemo />
                </div>
            </div>
            <p className="text-base-content/60 mt-8 font-medium">Feature Demos</p>

            <div className="mt-8 space-y-6 xl:space-y-8 2xl:space-y-12">
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box flex flex-wrap items-center justify-between space-x-2 px-5 py-4">
                        <p className="font-medium">Simple</p>
                        <p className="text-base-content/70 text-sm">Clean layout for static content</p>
                    </div>
                    <div className="py-1">
                        <SimpleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box flex flex-wrap items-center justify-between space-x-2 px-5 py-4">
                        <p className="font-medium">Scrollable</p>
                        <p className="text-base-content/70 text-sm">Scroll to view more rows</p>
                    </div>
                    <ScrollableDemo />
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box flex flex-wrap items-center justify-between space-x-2 px-5 py-4">
                        <p className="font-medium">Column Search</p>
                        <p className="text-base-content/70 text-sm">Search specific columns like name</p>
                    </div>
                    <div className="pb-1">
                        <ColumnSearchDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box flex flex-wrap items-center justify-between space-x-2 px-5 py-4">
                        <p className="font-medium">Global Search</p>
                        <p className="text-base-content/70 text-sm">Search across all table fields</p>
                    </div>
                    <div className="pb-1">
                        <GlobalSearchDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box flex flex-wrap items-center justify-between space-x-2 px-5 py-4">
                        <p className="font-medium">Pagination</p>
                        <p className="text-base-content/70 text-sm">Navigate data page by page</p>
                    </div>
                    <div className="py-1">
                        <PaginationDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box flex flex-wrap items-center justify-between space-x-2 px-5 py-4">
                        <p className="font-medium">Sorting</p>
                        <p className="text-base-content/70 text-sm">Sort rows by column values</p>
                    </div>
                    <div className="py-1">
                        <SortingDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box flex flex-wrap items-center justify-between space-x-2 px-5 py-4">
                        <p className="font-medium">Column Visibility</p>
                        <p className="text-base-content/70 text-sm">Show or hide table columns</p>
                    </div>
                    <ColumnVisibilityDemo />
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box flex flex-wrap items-center justify-between space-x-2 px-5 py-4">
                        <p className="font-medium">Row Selection</p>
                        <p className="text-base-content/70 text-sm">Select one or multiple rows</p>
                    </div>
                    <div>
                        <RowSelectionDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box flex flex-wrap items-center justify-between space-x-2 px-5 py-4">
                        <p className="font-medium">Row Actions</p>
                        <p className="text-base-content/70 text-sm">Perform actions directly on rows</p>
                    </div>
                    <div className="py-1">
                        <RowActionsDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DataTablesPage;
