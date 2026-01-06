/**
 * SettingsSidebar - Settings navigation sidebar with grouped menu items
 *
 * Displays settings navigation organized into groups:
 * - General: Templates, Template Studio
 * - AI & Extraction: Auto-extraction, LLM Settings, Chunking, Prompts
 * - Team: Members
 */
import { Link, useLocation } from 'react-router';
import { Icon } from '@/components/atoms/Icon';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  badge?: string;
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

const settingsGroups: NavGroup[] = [
  {
    id: 'general',
    title: 'General',
    items: [
      {
        path: '/admin/settings/project/templates',
        label: 'Template Packs',
        icon: 'lucide--package',
      },
      {
        path: '/admin/settings/project/template-studio',
        label: 'Template Studio',
        icon: 'lucide--sparkles',
      },
    ],
  },
  {
    id: 'ai-extraction',
    title: 'AI & Extraction',
    items: [
      {
        path: '/admin/settings/project/auto-extraction',
        label: 'Auto-Extraction',
        icon: 'lucide--zap',
      },
      {
        path: '/admin/settings/project/llm-settings',
        label: 'LLM Settings',
        icon: 'lucide--cpu',
      },
      {
        path: '/admin/settings/project/chunking',
        label: 'Document Processing',
        icon: 'lucide--scissors',
      },
      {
        path: '/admin/settings/ai/prompts',
        label: 'Prompts',
        icon: 'lucide--book-text',
      },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    items: [
      {
        path: '/admin/settings/project/mcp',
        label: 'MCP Integration',
        icon: 'lucide--plug',
      },
    ],
  },
  {
    id: 'team',
    title: 'Team',
    items: [
      {
        path: '/admin/settings/project/members',
        label: 'Members',
        icon: 'lucide--users',
      },
    ],
  },
];

export function SettingsSidebar() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <nav
      className="flex flex-col gap-6 py-4 pr-4"
      aria-label="Settings navigation"
    >
      {settingsGroups.map((group) => (
        <div key={group.id}>
          <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-base-content/60">
            {group.title}
          </h3>
          <ul className="menu menu-sm p-0 gap-0.5">
            {group.items.map((item) => (
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
                      isActive(item.path)
                        ? 'text-primary'
                        : 'text-base-content/60'
                    }`}
                  />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="badge badge-sm badge-primary ml-auto">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default SettingsSidebar;
