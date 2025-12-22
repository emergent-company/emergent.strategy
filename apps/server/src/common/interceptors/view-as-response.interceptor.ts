import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ViewAsUser } from '../middleware/view-as.middleware';

@Injectable()
export class ViewAsResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<any>();
    const viewAsUser: ViewAsUser | undefined = req.viewAsUser;
    const superadminUser = req.superadminUser;

    if (!viewAsUser || !superadminUser) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        if (data === null || data === undefined) {
          return data;
        }

        if (typeof data !== 'object' || Buffer.isBuffer(data)) {
          return data;
        }

        return {
          ...data,
          _viewAs: {
            userId: viewAsUser.id,
            userName:
              viewAsUser.displayName ||
              [viewAsUser.firstName, viewAsUser.lastName]
                .filter(Boolean)
                .join(' ') ||
              null,
            actingAs: 'superadmin',
          },
        };
      })
    );
  }
}
