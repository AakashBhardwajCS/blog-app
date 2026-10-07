import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { OrgRole } from '@prisma/client';
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

/** The signed-in user's tenant. Only ever taken from the verified token, never from a client-supplied header. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {

    const tenantId = context.switchToHttp().getRequest<{ user?: JwtPayload }>().user?.tenantId;

    if (!tenantId) throw new UnauthorizedException('Missing tenant context');

    return tenantId;

  },
);

const ORG_ROLES_KEY = 'orgRoles';

/** Restricts a route to users with one of these organization roles. Use after JwtAuthGuard. */
export const OrgRoles = (...roles: OrgRole[]) => SetMetadata(ORG_ROLES_KEY, roles);

@Injectable()
export class OrgRolesGuard implements CanActivate {
  
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<OrgRole[] | undefined>(ORG_ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!roles?.length) return true;

    const user = context.switchToHttp().getRequest<{ user?: JwtPayload }>().user;

    if (!user || !roles.includes(user.orgRole)) throw new ForbiddenException('You do not have permission to do that');

    return true;
  }
}

/** Owners and admins manage the organization and can moderate any post or comment. */
export function isOrgAdmin(role: OrgRole): boolean {

  return role === OrgRole.OWNER || role === OrgRole.ADMIN;
  
}
