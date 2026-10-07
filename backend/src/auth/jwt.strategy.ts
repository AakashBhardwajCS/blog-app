import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { OrgRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

/** Claims signed into the access token. */
export interface TokenClaims {
  sub: string;
  email: string;
  tenantId: string;
}

/** The authenticated user on the request: the token claims plus the user's current organization role. */
export interface JwtPayload extends TokenClaims {
  orgRole: OrgRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'development-secret',
    });
  }

  /**
   * Re-checks the user on every request so removing a member or changing their role
   * takes effect immediately, not when their 7-day token expires.
   */
  async validate(payload: TokenClaims): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tenantId: true, orgRole: true, deactivatedAt: true },
    });
    if (!user || user.deactivatedAt || user.tenantId !== payload.tenantId) throw new UnauthorizedException();
    return { sub: payload.sub, email: payload.email, tenantId: user.tenantId, orgRole: user.orgRole };
  }
}
