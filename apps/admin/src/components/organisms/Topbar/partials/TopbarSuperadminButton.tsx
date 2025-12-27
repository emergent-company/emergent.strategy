import React from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { Tooltip } from '@/components/atoms/Tooltip';
import { useSuperadmin } from '@/hooks/use-superadmin';

export const TopbarSuperadminButton: React.FC = () => {
  const navigate = useNavigate();
  const { isSuperadmin, isLoading } = useSuperadmin();

  // Don't render anything if not a superadmin or still loading
  if (isLoading || !isSuperadmin) {
    return null;
  }

  return (
    <Tooltip content="Superadmin Panel" placement="bottom">
      <button
        type="button"
        className="btn btn-circle btn-ghost btn-sm"
        onClick={() => navigate('/admin/superadmin/users')}
        aria-label="Superadmin Panel"
      >
        <Icon icon="lucide--shield" className="size-4.5" />
      </button>
    </Tooltip>
  );
};

export default TopbarSuperadminButton;
