// Molecule: ThemePicker - A dropdown for selecting Light/Dark/System theme
import { ComponentProps } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useConfig } from '@/contexts/config';

export interface ThemePickerProps extends ComponentProps<'div'> {
  iconClass?: string;
  dropdownClass?: string;
}

const themeOptions = [
  { value: 'light' as const, label: 'Light', icon: 'lucide--sun' },
  { value: 'dark' as const, label: 'Dark', icon: 'lucide--moon' },
  { value: 'system' as const, label: 'System', icon: 'lucide--laptop' },
];

export function ThemePicker({
  iconClass,
  dropdownClass,
  className,
  ...props
}: ThemePickerProps) {
  const { config, changeTheme } = useConfig();

  const currentTheme = config.theme;
  const currentOption =
    themeOptions.find((opt) => opt.value === currentTheme) || themeOptions[2];

  return (
    <div
      className={['dropdown dropdown-top dropdown-end', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      <div
        tabIndex={0}
        role="button"
        className="btn btn-sm btn-ghost gap-2"
        aria-label="Select Theme"
      >
        <Icon
          icon={currentOption.icon}
          className={['size-4', iconClass].filter(Boolean).join(' ')}
        />
        <span>{currentOption.label}</span>
        <Icon icon="lucide--chevron-up" className="size-3" />
      </div>
      <ul
        tabIndex={0}
        className={[
          'dropdown-content menu bg-base-100 rounded-box z-[1] w-40 p-2 shadow-lg border border-base-300 mb-2',
          dropdownClass,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {themeOptions.map((option) => (
          <li key={option.value}>
            <button
              onClick={() => changeTheme(option.value)}
              className={[
                'flex items-center gap-2',
                currentTheme === option.value ? 'active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <Icon icon={option.icon} className="size-4" />
              <span>{option.label}</span>
              {currentTheme === option.value && (
                <Icon icon="lucide--check" className="size-4 ml-auto" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ThemePicker;
