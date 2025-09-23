// Molecule: NewChatCtas
// Composite CTA panel for starting a new chat conversation with preset prompts plus composer.
import { ChatCtaCard } from '@/components/molecules/ChatCtaCard';
import { ChatPromptComposer } from '@/components/molecules/ChatPromptComposer';
export interface NewChatCard {
    icon: string; // iconify class e.g., 'lucide--sparkles'
    title: string;
    desc: string;
    prompt: string;
}

export interface NewChatCtasProps {
    onPickPrompt?: (p: string) => void | Promise<void>;
    onSubmit?: (p: string, opts?: { isPrivate?: boolean }) => void | Promise<void>;
    cards?: NewChatCard[];
}

const defaultCards: NewChatCard[] = [
    {
        icon: 'lucide--sparkles',
        title: 'Summarize Document',
        desc: 'Get a concise summary of your document.',
        prompt: 'Summarize the key points of the latest ingested document.',
    },
    {
        icon: 'lucide--list-checks',
        title: 'Action Items',
        desc: 'Extract action items from a meeting.',
        prompt: 'List the action items from the meeting transcript with owners and due dates.',
    },
    {
        icon: 'lucide--help-circle',
        title: 'Ask a Question',
        desc: 'Query your knowledge base.',
        prompt: 'What are the critical requirements mentioned in the requirements document?',
    },
];

export function NewChatCtas({ onPickPrompt, onSubmit, cards = defaultCards }: NewChatCtasProps) {
    return (
        <div className="w-full">
            <div className="gap-6 grid md:grid-cols-3 mt-6">
                {cards.map((card) => (
                    <ChatCtaCard
                        key={card.title}
                        icon={card.icon}
                        title={card.title}
                        desc={card.desc}
                        onPick={() => onPickPrompt?.(card.prompt)}
                    />
                ))}
            </div>

            {onSubmit && <ChatPromptComposer onSubmit={onSubmit} />}
        </div>
    );
}

export default NewChatCtas;
