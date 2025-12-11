import { useLocation, Link } from 'react-router';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  {
    path: '/admin/settings/project/templates',
    label: 'Template Packs',
    icon: 'lucide--package',
  },
  {
    path: '/admin/settings/project/auto-extraction',
    label: 'Auto-Extraction',
    icon: 'lucide--sparkles',
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
];

export function SettingsNav() {
  const location = useLocation();

  return (
    <div className="mb-6 tabs tabs-box">
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={`tab gap-2 ${
            location.pathname === item.path ? 'tab-active' : ''
          }`}
        >
          <span className={`iconify ${item.icon}`}></span>
          {item.label}
        </Link>
      ))}
    </div>
  );
}
