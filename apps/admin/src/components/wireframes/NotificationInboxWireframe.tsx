import React from 'react';

export interface NotificationInboxWireframeProps {
    state?: 'default' | 'empty' | 'loading';
    items?: number;
}

const TimeGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mb-4">
        <div className="px-4 py-2 font-semibold text-xs text-base-content/50">{title}</div>
        {children}
    </div>
);

export const NotificationInboxWireframe: React.FC<NotificationInboxWireframeProps> = ({ state = 'default', items = 8 }) => {
    const renderNotificationRow = (key: React.Key, hasUnread = true) => (
        <button key={key} className="group flex items-start gap-3 hover:bg-base-200/50 px-4 py-3 border-b border-base-300/50 w-full text-left transition-colors">
            {/* Left indicator */}
            <div className="flex-shrink-0 mt-1.5">
                <div className={`h-2 w-2 rounded-full ${hasUnread ? 'bg-primary' : 'bg-transparent'}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="mb-1.5 font-semibold text-base-content">
                    <div className="bg-base-300 rounded w-3/4 h-4" />
                </div>
                <div className="flex items-center gap-2 text-sm text-base-content/60">
                    <div className="bg-base-300/70 rounded w-full max-w-2xl h-3" />
                </div>
            </div>

            {/* Right side */}
            <div className="flex flex-shrink-0 items-center gap-3 text-xs text-base-content/50">
                <div className="flex items-center gap-1">
                    <div className="bg-base-300/70 rounded w-5 h-5" />
                    <div className="bg-base-300/70 rounded w-4 h-3" />
                </div>
                <div className="bg-base-300/70 rounded w-16 h-3" />
            </div>
        </button>
    );

    const renderList = () => {
        if (state === 'loading') {
            return (
                <TimeGroup title="Today">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-base-300/50 animate-pulse">
                            <div className="bg-base-300 mt-1.5 rounded-full w-2 h-2" />
                            <div className="flex-1 space-y-2">
                                <div className="bg-base-300 rounded w-3/4 h-4" />
                                <div className="bg-base-300/70 rounded w-full h-3" />
                            </div>
                            <div className="bg-base-300/70 rounded w-16 h-3" />
                        </div>
                    ))}
                </TimeGroup>
            );
        }

        if (state === 'empty') {
            return (
                <div className="flex flex-col justify-center items-center gap-3 py-16 text-center">
                    <div className="bg-base-300/50 rounded-lg w-12 h-12" />
                    <div className="text-sm text-base-content/60">No notifications in this tab.</div>
                </div>
            );
        }

        return (
            <>
                <TimeGroup title="Today">
                    {renderNotificationRow(0, true)}
                    {renderNotificationRow(1, true)}
                </TimeGroup>
                <TimeGroup title="Yesterday">
                    {renderNotificationRow(2, false)}
                    {renderNotificationRow(3, true)}
                    {renderNotificationRow(4, false)}
                </TimeGroup>
                <TimeGroup title="Last 7 days">
                    {renderNotificationRow(5, false)}
                    {renderNotificationRow(6, false)}
                    {renderNotificationRow(7, false)}
                </TimeGroup>
            </>
        );
    };

    return (
        <div className="flex flex-col bg-base-100 border border-base-300 rounded h-[600px]">
            {/* Top bar with tabs and actions */}
            <div className="flex justify-between items-center px-4 py-2 border-b border-base-300">
                {/* Tabs */}
                <div className="flex items-center gap-1">
                    <button className="hover:bg-base-200 px-3 py-1.5 rounded font-medium text-sm">
                        All
                    </button>
                    <button className="bg-base-200 px-3 py-1.5 rounded font-medium text-sm">
                        Important
                        <span className="bg-primary ml-1.5 px-1.5 py-0.5 rounded-full text-primary-content text-xs">47</span>
                    </button>
                    <button className="hover:bg-base-200 px-3 py-1.5 rounded font-medium text-sm">
                        Other
                        <span className="bg-base-300 ml-1.5 px-1.5 py-0.5 rounded-full text-xs">45</span>
                    </button>
                    <button className="hover:bg-base-200 px-3 py-1.5 rounded font-medium text-sm">
                        Snoozed
                    </button>
                    <button className="hover:bg-base-200 px-3 py-1.5 rounded font-medium text-sm">
                        Cleared
                    </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button className="hover:bg-base-200 px-3 py-1.5 rounded text-sm">
                        <span className="w-4 h-4 iconify lucide--filter" />
                    </button>
                    <button className="hover:bg-base-200 px-3 py-1.5 rounded text-sm">
                        Clear all
                    </button>
                    <button className="hover:bg-base-200 px-3 py-1.5 rounded text-sm">
                        Customize
                    </button>
                </div>
            </div>

            {/* Notification list - full width, single column */}
            <div className="flex-1 overflow-y-auto">
                {renderList()}
            </div>
        </div>
    );
};

export default NotificationInboxWireframe;
