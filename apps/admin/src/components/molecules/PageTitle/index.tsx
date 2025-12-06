import { ReactNode } from 'react';
import { Link } from 'react-router';

export interface IBreadcrumbItem {
  label: string;
  path?: string;
  active?: boolean;
}

export interface PageTitleProps {
  items?: IBreadcrumbItem[];
  title: string;
  centerItem?: ReactNode;
}

export function PageTitle({ title, items, centerItem }: PageTitleProps) {
  return (
    <div className="flex justify-between items-center">
      <p className="font-medium text-lg">{title}</p>
      {centerItem != null && centerItem}
      {items && (
        <div className="hidden sm:inline p-0 text-sm breadcrumbs">
          <ul>
            <li>
              <Link to="/admin">Emergent</Link>
            </li>
            {items.map((item, index) => (
              <li key={index} className={item.active ? 'opacity-80' : ''}>
                {item.path ? (
                  <Link to={item.path}>{item.label}</Link>
                ) : (
                  item.label
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default PageTitle;
