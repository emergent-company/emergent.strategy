import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate, Link, useLocation, Outlet } from 'react-router';
import { useSuperadmin } from '@/hooks/use-superadmin';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  children?: NavItem[];
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
    path: '/admin/superadmin/jobs',
    label: 'Jobs',
    icon: 'lucide--activity',
    children: [
      {
        path: '/admin/superadmin/jobs',
        label: 'Overview',
        icon: 'lucide--bar-chart-3',
      },
      {
        path: '/admin/superadmin/jobs/extraction',
        label: 'Extraction Jobs',
        icon: 'lucide--file-search',
      },
      {
        path: '/admin/superadmin/jobs/embedding',
        label: 'Embedding Jobs',
        icon: 'lucide--cpu',
      },
      {
        path: '/admin/superadmin/jobs/conversion',
        label: 'Conversion Jobs',
        icon: 'lucide--file-cog',
      },
      {
        path: '/admin/superadmin/jobs/sync',
        label: 'Data Source Sync',
        icon: 'lucide--refresh-cw',
      },
    ],
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
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Auto-expand parent menu if child is active
  useEffect(() => {
    superadminNavItems.forEach((item) => {
      if (item.children) {
        const isChildActive = item.children.some(
          (child) =>
            location.pathname === child.path ||
            (child.path !== '/admin/superadmin/jobs' &&
              location.pathname.startsWith(child.path))
        );
        if (isChildActive || location.pathname.startsWith(item.path)) {
          setExpandedItems((prev) => new Set([...prev, item.path]));
        }
      }
    });
  }, [location.pathname]);

  const isActive = (path: string, exact = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const toggleExpanded = (path: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNavItem = (item: NavItem, isChild = false) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.path);
    const active = hasChildren
      ? isActive(item.path)
      : isChild
      ? location.pathname === item.path
      : isActive(item.path);

    if (hasChildren) {
      return (
        <li key={item.path}>
          <button
            onClick={() => toggleExpanded(item.path)}
            className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors w-full ${
              active
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-base-200 text-base-content/80'
            }`}
          >
            <div className="flex items-center gap-3">
              <Icon
                icon={item.icon}
                className={`size-4 ${
                  active ? 'text-primary' : 'text-base-content/60'
                }`}
              />
              <span>{item.label}</span>
            </div>
            <Icon
              icon={
                isExpanded ? 'lucide--chevron-down' : 'lucide--chevron-right'
              }
              className="size-4 text-base-content/40"
            />
          </button>
          {isExpanded && (
            <ul className="ml-4 mt-1 border-l border-base-200 pl-2 space-y-0.5">
              {item.children!.map((child) => renderNavItem(child, true))}
            </ul>
          )}
        </li>
      );
    }

    return (
      <li key={item.path}>
        <Link
          to={item.path}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
            active
              ? 'bg-primary/10 text-primary font-medium'
              : 'hover:bg-base-200 text-base-content/80'
          }`}
          aria-current={active ? 'page' : undefined}
        >
          <Icon
            icon={item.icon}
            className={`size-4 ${
              active ? 'text-primary' : 'text-base-content/60'
            }`}
          />
          <span>{item.label}</span>
        </Link>
      </li>
    );
  };

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
        {superadminNavItems.map((item) => renderNavItem(item))}
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
      <main className="flex-1 min-w-0 h-full overflow-y-auto">
        {children || <Outlet />}
      </main>
    </div>
  );
}

export default SuperadminLayout;
