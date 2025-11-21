import { ReactNode, useState } from 'react';

export interface Conversation {
  id: string;
  title: string;
  messages: Array<{ id: string; [key: string]: any }>;
  createdAt: string;
  updatedAt: string;
  draftText?: string | null;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (conversation: Conversation) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  header?: ReactNode;
}

// Helper function to format relative time
function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

/**
 * ConversationList - Enhanced conversation sidebar
 *
 * Features:
 * - List of past conversations
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
  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        <input
          type="text"
          placeholder="Search conversations..."
          className="input input-bordered input-sm w-full"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredConversations.length === 0 ? (
          <div className="text-center text-base-content/40 py-8 text-sm">
            {searchQuery ? 'No matches found' : 'No conversations yet'}
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-base-200 transition-colors ${
                activeId === conv.id
                  ? 'bg-base-200 border-l-4 border-primary'
                  : ''
              }`}
              onClick={() => onSelect(conv)}
            >
              <div className="flex-1 min-w-0 pr-2">
                <div
                  className="font-medium truncate text-sm"
                  title={conv.title}
                >
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
          ))
        )}
      </div>
    </aside>
  );
}
