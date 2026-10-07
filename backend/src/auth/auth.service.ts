import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Department, OrgRole, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto';

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  department: Department;
  role: string;
  avatarUrl: string | null;
  orgRole: OrgRole;
  tenant: { id: string; name: string; slug: string };
};

/** Adding this for convenience of selecting fields. The user fields that are safe to send to the client (never the password hash). */
export const publicUserSelect = {
  id: true,
  tenantId: true,
  email: true,
  name: true,
  department: true,
  role: true,
  avatarUrl: true,
  orgRole: true,
  tenant: { select: { id: true, name: true, slug: true } },
} as const; // This tells TypeScript to treat these values as literal constants rather than general mutable values.

/** An invite that can still be redeemed: not revoked, not expired and not used up. */
export function usableInviteWhere(now = new Date()): Prisma.InviteWhereInput {
  return { revokedAt: null, expiresAt: { gt: now } };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // utility function to slugify a string for use as a tenant slug
  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'tenant';
  }

  private async token(user: PublicUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, email: user.email, tenantId: user.tenantId });
  }

  /**
   * With an invite code the user joins that invite's organization with the invite's role.
   * Without one, a new organization is created and the user becomes its owner. Knowing an
   * organization's slug is deliberately not enough to join it.
   */
  async register(dto: RegisterDto): Promise<{ token: string; user: PublicUser }> {
    const email = dto.email.toLowerCase();
    const profile = {
      email,
      name: dto.name,
      password: await bcrypt.hash(dto.password, 12),
      department: dto.department,
      role: dto.role,
    };

    const user = dto.inviteCode
      ? await this.joinWithInvite(dto.inviteCode, profile)
      : await this.prisma.user.create({
          data: {
            ...profile,
            orgRole: OrgRole.OWNER,
            tenant: {
              create: {
                name: dto.tenantName ?? `${dto.name}'s Organization`,
                slug: await this.uniqueTenantSlug(dto.tenantName ?? dto.name),
              },
            },
          },
          select: publicUserSelect,
        });

    return { token: await this.token(user), user };
  }

  private async joinWithInvite(
    code: string,
    profile: Omit<Prisma.UserUncheckedCreateInput, 'tenantId'>,
  ): Promise<PublicUser> {

    return this.prisma.$transaction(async (tx) => {

      const invite = await tx.invite.findFirst({ where: { code, ...usableInviteWhere() } });

      if (!invite || (invite.maxUses !== null && invite.uses >= invite.maxUses)) {
        throw new BadRequestException('This invite is invalid or has expired');
      }

      if (invite.email && invite.email !== profile.email) {
        throw new BadRequestException('This invite was issued for a different email address');
      }

      if (await tx.user.findFirst({ where: { tenantId: invite.tenantId, email: profile.email }, select: { id: true } })) {
        throw new ConflictException('This email is already registered in that organization. Sign in instead.');
      }

      // Conditional increment so two sign-ups racing for the last use can't both succeed.
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, ...(invite.maxUses !== null ? { uses: { lt: invite.maxUses } } : {}) },
        data: { uses: { increment: 1 } },
      });

      if (claimed.count === 0) throw new BadRequestException('This invite is invalid or has expired');

      return tx.user.create({
        data: { ...profile, tenantId: invite.tenantId, orgRole: invite.role },
        select: publicUserSelect,
      });

    });
  }

  private async uniqueTenantSlug(name: string): Promise<string> {
    const root = this.slugify(name);
    for (let index = 1; ; index += 1) {
      const slug = index === 1 ? root : `${root}-${index}`;
      if (!(await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } }))) return slug;
    }
  }

  async login(dto: LoginDto): Promise<{ token: string; user: PublicUser }> {
    // use transform pipe instead of this
    const email = dto.email.toLowerCase();

    const tenantSlug = dto.tenantSlug ? dto.tenantSlug.toLowerCase() : undefined;

    let tenantId: string | undefined;

    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
      if (!tenant) throw new UnauthorizedException('Organization was not found');
      tenantId = tenant.id;
    }

    const matches = await this.prisma.user.findMany({
      where: { email, deactivatedAt: null, ...(tenantId ? { tenantId } : {}) },
      select: { ...publicUserSelect, password: true },
    });

    if (matches.length > 1) {
      throw new UnauthorizedException('This email belongs to more than one organization. Enter the organization to sign in to.');
    }

    const user = matches[0];
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { password: _password, ...publicUser } = user;

    return { token: await this.token(publicUser), user: publicUser };
  }

  async me(id: string): Promise<PublicUser> {

    const user = await this.prisma.user.findFirst({
      where: { id, deactivatedAt: null },
      select: publicUserSelect,
    });

    if (!user) throw new UnauthorizedException();

    return user;
  }
}
