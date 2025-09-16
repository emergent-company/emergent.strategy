/**
 * Lightweight Storybook action helper replacement.
 * Provides a typed action() factory that logs to console with consistent prefix.
 * Abstracted so stories share a single implementation.
 */

export type StoryAction = (...args: unknown[]) => void;

export function action(name: string): StoryAction {
    return (...args: unknown[]) => {
        console.log(`[story-action:${name}]`, ...args);
    };
}
