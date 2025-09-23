// Molecule: ThemeToggle (migrated from components/ThemeToggle)
// TODO(atomic-migrate): remove legacy shim after 2025-11
import { ComponentProps } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useConfig } from '@/contexts/config';

export interface ThemeToggleProps extends ComponentProps<'button'> {
    iconClass?: string;
}

export function ThemeToggle({ iconClass, className, ...props }: ThemeToggleProps) {
    const { toggleTheme } = useConfig();
    return (
        <button
            {...props}
            className={['relative overflow-hidden', className].filter(Boolean).join(' ')}
            onClick={() => toggleTheme()}
            aria-label="Toggle Theme"
        >
            <Icon
                icon="lucide--sun"
                className={[
                    'absolute size-4.5 -translate-y-4 opacity-0 transition-all duration-300',
                    'group-data-[theme=light]/html:translate-y-0 group-data-[theme=light]/html:opacity-100',
                    iconClass,
                ]
                    .filter(Boolean)
                    .join(' ')}
            />
            <Icon
                icon="lucide--moon"
                className={[
                    'absolute size-4.5 translate-y-4 opacity-0 transition-all duration-300',
                    'group-data-[theme=dark]/html:translate-y-0 group-data-[theme=dark]/html:opacity-100',
                    iconClass,
                ]
                    .filter(Boolean)
                    .join(' ')}
            />
            <Icon
                icon="lucide--palette"
                className={[
                    'absolute size-4.5 opacity-100',
                    'group-data-[theme=dark]/html:opacity-0 group-data-[theme=light]/html:opacity-0',
                    iconClass,
                ]
                    .filter(Boolean)
                    .join(' ')}
            />
        </button>
    );
}

export default ThemeToggle;