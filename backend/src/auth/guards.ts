import { ExecutionContext, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtPayload } from './jwt.strategy';

export class JwtAuthGuard extends AuthGuard('jwt') {}

// createParamDecorator is a function that creates a custom decorator that can be used to extract data from the request object.
// In this case, we are creating a custom decorator called CurrentUser
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload => {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!request.user) throw new UnauthorizedException('Missing authenticated user');
    return request.user;
  },
);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload; tenantId?: string }>();
    const tenantId = request.user?.tenantId ?? request.tenantId;
    if (!tenantId) throw new UnauthorizedException('Missing tenant context');
    return tenantId;
  },
);
