import { AuthUser } from '../../modules/auth/auth.service';
import { ViewAsUser } from '../middleware/view-as.middleware';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      isSuperadmin?: boolean;
      superadminUser?: AuthUser;
      viewAsUser?: ViewAsUser;
    }
  }
}

export {};
