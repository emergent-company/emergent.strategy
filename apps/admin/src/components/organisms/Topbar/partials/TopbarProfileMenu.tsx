import React from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/contexts/useAuth';
import { Icon } from '@/components/atoms/Icon';

export const TopbarProfileMenu: React.FC = () => {
  const { logout } = useAuth();

  return (
    <div
      className="dropdown-bottom ms-1 dropdown dropdown-end"
      data-testid="profile-menu"
    >
      <div tabIndex={0} className="cursor-pointer" data-testid="avatar-trigger">
        <div className="bg-base-200 rounded-full ring ring-success size-7 overflow-hidden avatar">
          <img
            src="/images/avatars/1.png"
            alt="Avatar"
            data-testid="avatar-image"
          />
        </div>
      </div>
      <div
        tabIndex={0}
        className="bg-base-100 shadow mt-2 rounded-box w-44 dropdown-content"
      >
        <ul className="p-2 w-full menu">
          <li>
            <Link to="/admin/settings/profile">
              <Icon icon="lucide--user" className="size-4" />
              <span>My Profile</span>
            </Link>
          </li>
          <li>
            <Link to="/admin/settings">
              <Icon icon="lucide--settings" className="size-4" />
              <span>Settings</span>
            </Link>
          </li>
          <li>
            <Link to="#">
              <Icon icon="lucide--help-circle" className="size-4" />
              <span>Help</span>
            </Link>
          </li>
        </ul>
        <hr className="border-base-300" />
        <ul className="p-2 w-full menu">
          <li>
            <div>
              <Icon icon="lucide--arrow-left-right" className="size-4" />
              <span>Switch Account</span>
            </div>
          </li>
          <li>
            <button
              type="button"
              onClick={logout}
              className="flex items-center hover:bg-error/10 text-error"
              aria-label="Logout"
            >
              <Icon icon="lucide--log-out" className="size-4" />
              <span>Logout</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default TopbarProfileMenu;
