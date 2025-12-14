import { ReactNode, useState, useMemo } from 'react';
import { format, isToday, isYesterday, differenceInHours } from 'date-fns';

export interface Conversation {
  id: string;
  title: string;
  messages: Array<{ id: string; [key: string]: any }>;
  createdAt: string;
  updatedAt: string;
  draftText?: string | null;
  /** The object ID this conversation is associated with (e.g., for refinement chats) */
  objectId?: string | null;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (conversation: Conversation) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  header?: ReactNode;
}

interface GroupedConversations {
  today: Conversation[];
  yesterday: Conversation[];
  older: { [date: string]: Conversation[] };
}

/**
 * Format timestamp using the same algorithm as MessageBubble:
 * - Less than 5 hours ago: "X hours ago" or "just now"
 * - More than 5 hours but today or yesterday: time only (e.g., "3:45 PM")
 * - Before yesterday: full date and time (e.g., "Nov 20, 2025 3:45 PM")
 */
function formatRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const hoursAgo = differenceInHours(now, date);

    // Less than 5 hours ago: show relative time
    if (hoursAgo < 5) {
      if (hoursAgo === 0) {
        return 'just now';
      } else if (hoursAgo === 1) {
        return '1 hour ago';
      } else {
        return `${hoursAgo} hours ago`;
      }
    }

    // Yesterday or today (but more than 5 hours ago): show time only
    if (isToday(date) || isYesterday(date)) {
      return format(date, 'h:mm a'); // "3:45 PM"
    }

    // Before yesterday: show full date and time
    return format(date, 'MMM d, yyyy h:mm a'); // "Nov 20, 2025 3:45 PM"
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return 'just now';
  }
}

/**
 * Group conversations by date: Today, Yesterday, and older dates
 */
function groupConversationsByDate(
  conversations: Conversation[]
): GroupedConversations {
  const grouped: GroupedConversations = {
    today: [],
    yesterday: [],
    older: {},
  };

  conversations.forEach((conv) => {
    const date = new Date(conv.updatedAt);

    if (isToday(date)) {
      grouped.today.push(conv);
    } else if (isYesterday(date)) {
      grouped.yesterday.push(conv);
    } else {
      // Group by date string (e.g., "Monday, November 20, 2025")
      const dateKey = format(date, 'EEEE, MMMM d, yyyy');
      if (!grouped.older[dateKey]) {
        grouped.older[dateKey] = [];
      }
      grouped.older[dateKey].push(conv);
    }
  });

  return grouped;
}

/**
 * Render a single conversation item
 */
function ConversationItem({
  conv,
  activeId,
  onSelect,
  onDelete,
}: {
  conv: Conversation;
  activeId?: string;
  onSelect: (conv: Conversation) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      key={conv.id}
      className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-base-200 transition-colors ${
        activeId === conv.id ? 'bg-base-200 border-l-4 border-primary' : ''
      }`}
      onClick={() => onSelect(conv)}
    >
      <div className="flex-1 min-w-0 pr-2">
        <div className="font-medium truncate text-sm" title={conv.title}>
          {conv.title || 'New Conversation'}
        </div>
        <div className="text-xs text-base-content/60">
          {formatRelativeTime(conv.updatedAt)}
        </div>
      </div>
      <button
        className="btn btn-square btn-ghost btn-xs opacity-0 group-hover:opacity-100 text-error"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conv.id);
        }}
        title="Delete conversation"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  );
}

/**
 * ConversationList - Enhanced conversation sidebar with date grouping
 *
 * Features:
 * - List of past conversations grouped by date
 * - "Today", "Yesterday", and date-based groups
 * - Active conversation highlighting
 * - Delete button for each conversation (shows on hover)
 * - New chat button
 * - Search functionality
 * - Relative time display
 * - Optional header slot (e.g., for project switcher)
 */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNew,
  header,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter conversations based on search query
  const filteredConversations = useMemo(
    () =>
      conversations.filter((conv) =>
        conv.title.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [conversations, searchQuery]
  );

  // Group filtered conversations by date
  const groupedConversations = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

  const hasConversations = filteredConversations.length > 0;

  return (
    <aside className="bg-base-100 shadow-xl w-80 min-h-full overflow-x-hidden text-base-content flex flex-col border-r border-base-300">
      {/* Optional Header Slot */}
      {header && <div className="p-4 border-b border-base-300">{header}</div>}

      {/* Conversations Header */}
      <div className="p-4 border-b border-base-300">
        <h2 className="font-bold text-lg mb-4">Conversations</h2>

        {/* New Conversation Button */}
        <button
          className="btn btn-primary w-full gap-2 mb-2"
          onClick={onNew}
          aria-label="New conversation"
        >
          <span>+</span> New Conversation
        </button>

        {/* Search Input */}
        <label className="input input-bordered input-sm w-full">
          <svg
            className="h-4 w-4 opacity-50"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            placeholder="Search conversations..."
            className="grow"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>
      </div>

      {/* Conversation List with Date Groups */}
      <div className="flex-1 overflow-y-auto p-2">
        {!hasConversations ? (
          <div className="text-center text-base-content/40 py-8 text-sm">
            {searchQuery ? 'No matches found' : 'No conversations yet'}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Today Group */}
            {groupedConversations.today.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider px-3 py-2">
                  Today
                </div>
                <div className="space-y-1">
                  {groupedConversations.today.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      activeId={activeId}
                      onSelect={onSelect}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Yesterday Group */}
            {groupedConversations.yesterday.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider px-3 py-2">
                  Yesterday
                </div>
                <div className="space-y-1">
                  {groupedConversations.yesterday.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      activeId={activeId}
                      onSelect={onSelect}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Older Groups (by date) */}
            {Object.keys(groupedConversations.older)
              .sort((a, b) => {
                // Sort dates in descending order (most recent first)
                const dateA = new Date(a);
                const dateB = new Date(b);
                return dateB.getTime() - dateA.getTime();
              })
              .map((dateKey) => (
                <div key={dateKey}>
                  <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider px-3 py-2">
                    {dateKey}
                  </div>
                  <div className="space-y-1">
                    {groupedConversations.older[dateKey].map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conv={conv}
                        activeId={activeId}
                        onSelect={onSelect}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </aside>
  );
}
