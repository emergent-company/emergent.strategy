import { Icon } from '@/components/atoms/Icon';

export interface ObjectRefCardProps {
    /** Object UUID */
    id: string;
    /** Object type (e.g., "Decision", "Risk", "Feature") */
    type: string;
    /** Display name */
    name: string;
    /** Optional one-line summary */
    summary?: string;
    /** Click handler to open details */
    onClick: () => void;
}

/**
 * Compact card for displaying entity references in chat responses.
 * Designed to be embedded inline with chat messages.
 * 
 * Follows the design pattern from ExtractionJobCard and IntegrationCard:
 * - Compact layout (~60px height)
 * - Icon + title + badge + summary
 * - Hover effects: border color, shadow, icon color
 * - Chevron indicator for clickability
 */
export function ObjectRefCard({ id, type, name, summary, onClick }: ObjectRefCardProps) {
    return (
        <button
            onClick={onClick}
            className="card bg-base-100 border border-base-300 hover:border-primary hover:shadow-md transition-all text-left w-full group"
        >
            <div className="card-body p-3">
                <div className="flex items-center gap-2">
                    {/* Icon Container */}
                    <div className="flex-shrink-0 w-8 h-8 bg-base-200 rounded flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                        <Icon 
                            icon="lucide--box" 
                            className="w-4 h-4 text-base-content/70 group-hover:text-primary transition-colors" 
                        />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="font-medium text-sm truncate">{name}</h4>
                            <span className="badge badge-xs badge-ghost">{type}</span>
                        </div>
                        {summary && (
                            <p className="text-xs text-base-content/70 line-clamp-1">{summary}</p>
                        )}
                    </div>
                    
                    {/* Chevron Indicator */}
                    <Icon 
                        icon="lucide--chevron-right" 
                        className="w-4 h-4 text-base-content/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" 
                    />
                </div>
            </div>
        </button>
    );
}
