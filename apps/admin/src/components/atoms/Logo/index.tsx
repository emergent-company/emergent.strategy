import { useLogoVariant, LogoVariant } from '@/hooks/useLogoVariant';

export interface LogoProps {
  className?: string;
  variant?: LogoVariant;
}

export const Logo = ({ className, variant: propVariant }: LogoProps) => {
  const { variant: globalVariant } = useLogoVariant();
  const variant = propVariant || globalVariant;

  const gradients: Record<LogoVariant, string> = {
    // Default: Blue to Cyan
    'two-tone-blue': 'bg-gradient-to-r from-blue-500 via-cyan-400 to-cyan-300',

    // Theme-based gradients (adapt to current theme)
    'theme-primary-accent': 'bg-gradient-to-r from-primary to-accent',
    'theme-primary-secondary': 'bg-gradient-to-r from-primary to-secondary',
    'theme-secondary-accent': 'bg-gradient-to-r from-secondary to-accent',
    'theme-full': 'bg-gradient-to-r from-primary via-secondary to-accent',
    'theme-monochrome':
      'bg-gradient-to-r from-primary/100 via-primary/80 to-primary/60',
    'theme-monochrome-subtle':
      'bg-gradient-to-r from-primary/90 via-primary/70 to-primary/50',

    // Fixed color gradients (don't change with theme)
    sunset: 'bg-gradient-to-r from-orange-400 via-red-500 to-red-600',
    verdant: 'bg-gradient-to-r from-emerald-400 to-teal-500',
    'blue-purple':
      'bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-400',
    ocean: 'bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-400',
    fire: 'bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400',
    forest: 'bg-gradient-to-r from-green-700 via-emerald-500 to-lime-400',
    cosmic: 'bg-gradient-to-r from-purple-600 via-pink-500 to-rose-400',
    arctic: 'bg-gradient-to-r from-cyan-600 via-blue-400 to-indigo-300',

    // Legacy (kept for backward compatibility)
    'primary-accent': 'bg-gradient-to-r from-primary to-accent',
    original: 'bg-gradient-to-r from-primary via-secondary to-accent',
    monochrome:
      'bg-gradient-to-r from-primary/100 via-primary/80 to-primary/60',
  };

  return (
    <div className={['flex items-center', className].filter(Boolean).join(' ')}>
      <span
        className={`text-2xl ${gradients[variant]} bg-clip-text text-transparent`}
        style={{
          fontFamily: 'var(--logo-font-family, Inter)',
          fontWeight: 'var(--logo-font-weight, 700)',
          textTransform: 'var(--logo-text-transform, uppercase)' as any,
        }}
      >
        emergent
      </span>
    </div>
  );
};

export default Logo;
