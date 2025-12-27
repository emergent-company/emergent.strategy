import React from 'react';
import {
  Avatar,
  AvatarSize,
  AvatarRadiusToken,
} from '@/components/atoms/Avatar';

export interface TableAvatarCellProps {
  name: string;
  subtitle?: string;
  avatarUrl?: string;
  size?: Extract<AvatarSize, 'xs' | 'sm' | 'md'>; // constrain sizes for table density
  rounded?: boolean; // legacy convenience (mapped to circle shape)
  radius?: AvatarRadiusToken | number; // forwarded to Avatar when not rounded
  className?: string;
}

const sizeMap: Record<
  NonNullable<TableAvatarCellProps['size']>,
  { pad: string; gap: string; name: string; sub: string; avatar: AvatarSize }
> = {
  xs: {
    pad: 'px-3 py-1.5',
    gap: 'gap-2',
    name: 'text-xs',
    sub: 'text-[10px]',
    avatar: 'xs',
  },
  sm: {
    pad: 'px-3.5 py-2',
    gap: 'gap-2.5',
    name: 'text-sm',
    sub: 'text-xs',
    avatar: 'sm',
  },
  md: {
    pad: 'px-4 py-3',
    gap: 'gap-3',
    name: 'text-sm',
    sub: 'text-xs',
    avatar: 'sm',
  },
};

export function TableAvatarCell({
  name,
  subtitle,
  avatarUrl,
  size = 'md',
  rounded,
  radius,
  className,
}: TableAvatarCellProps) {
  const cfg = sizeMap[size];
  return (
    <div
      className={[
        `flex items-start ${cfg.gap} ${cfg.pad}`,
        'min-w-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-component="TableAvatarCell"
    >
      <Avatar
        src={avatarUrl}
        name={!avatarUrl ? name : undefined}
        size={cfg.avatar}
        shape={rounded ? 'circle' : 'square'}
        radius={!rounded ? radius ?? 'field' : undefined}
      />
      <div className="flex flex-col min-w-0 leading-snug">
        <p className={`font-medium text-base-content truncate ${cfg.name}`}>
          {name}
        </p>
        {subtitle && (
          <p className={`text-base-content/60 truncate ${cfg.sub}`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

export default TableAvatarCell;
