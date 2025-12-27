import { type ReactNode, useEffect } from 'react';
import { useNavigate, Link, useLocation, Outlet } from 'react-router';
import { useSuperadmin } from '@/hooks/use-superadmin';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const superadminNavItems: NavItem[] = [
  {
    path: '/admin/superadmin/dashboard',
    label: 'Dashboard',
    icon: 'lucide--layout-dashboard',
  },
  {
    path: '/admin/superadmin/environment',
    label: 'Environment',
    icon: 'lucide--settings',
  },
  {
    path: '/admin/superadmin/users',
    label: 'Users',
    icon: 'lucide--users',
  },
  {
    path: '/admin/superadmin/organizations',
    label: 'Organizations',
    icon: 'lucide--building-2',
  },
  {
    path: '/admin/superadmin/projects',
    label: 'Projects',
    icon: 'lucide--folder',
  },
  {
    path: '/admin/superadmin/emails',
    label: 'Email History',
    icon: 'lucide--mail',
  },
  {
    path: '/admin/superadmin/email-templates',
    label: 'Email Templates',
    icon: 'lucide--file-code',
  },
  {
    path: '/admin/superadmin/releases',
    label: 'Releases',
    icon: 'lucide--rocket',
  },
];

function SuperadminSidebar() {
  const location = useLocation();

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav
      className="flex flex-col gap-2 py-4 pr-4"
      aria-label="Superadmin navigation"
    >
      <div className="mb-2 px-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
          System Administration
        </h3>
      </div>
      <ul className="menu menu-sm p-0 gap-0.5">
        {superadminNavItems.map((item) => (
          <li key={item.path}>
            <Link
              to={item.path}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                isActive(item.path)
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-base-200 text-base-content/80'
              }`}
              aria-current={isActive(item.path) ? 'page' : undefined}
            >
              <Icon
                icon={item.icon}
                className={`size-4 ${
                  isActive(item.path) ? 'text-primary' : 'text-base-content/60'
                }`}
              />
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface SuperadminLayoutProps {
  children?: ReactNode;
}

export function SuperadminLayout({ children }: SuperadminLayoutProps) {
  const { isSuperadmin, isLoading } = useSuperadmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isSuperadmin) {
      navigate('/admin', { replace: true });
    }
  }, [isLoading, isSuperadmin, navigate]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isSuperadmin) {
    return null;
  }

  return (
    <div
      className="flex h-full overflow-hidden"
      data-testid="superadmin-layout"
    >
      <aside className="hidden lg:block w-56 shrink-0 border-r border-base-200 overflow-y-auto">
        <SuperadminSidebar />
      </aside>
      <main className="flex-1 min-w-0 h-full overflow-hidden">
        {children || <Outlet />}
      </main>
    </div>
  );
}

export default SuperadminLayout;
