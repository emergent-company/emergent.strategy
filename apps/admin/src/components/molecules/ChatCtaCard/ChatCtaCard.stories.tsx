import type { Meta, StoryObj } from '@storybook/react';
import { ChatCtaCard, type ChatCtaCardProps } from './index';
import { action } from '@/stories';

const meta: Meta<typeof ChatCtaCard> = {
    title: 'Molecules/ChatCtaCard',
    component: ChatCtaCard,
    args: {
        icon: 'lucide--sparkles',
        title: 'Upgrade Plan',
        desc: 'Unlock higher usage limits and priority processing.',
        onPick: action('onPick'),
    } as ChatCtaCardProps,
    parameters: {
        docs: {
            description: {
                component:
                    'Call‑to‑action card surfaced contextually inside conversation list when user has no conversations or hits a usage boundary. Encourages upgrade or creation of first chat.',
            },
        },
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
