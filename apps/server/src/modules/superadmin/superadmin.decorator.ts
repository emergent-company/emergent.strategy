import { SetMetadata } from '@nestjs/common';

export const SUPERADMIN_KEY = 'requires_superadmin';
export const Superadmin = () => SetMetadata(SUPERADMIN_KEY, true);
