import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { usableInviteWhere } from '../auth/auth.service';
import { JwtPayload } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInviteDto, UpdateMemberDto, UpdateOrganizationDto } from './dto';

const DEFAULT_INVITE_DAYS = 7;

const memberSelect = {
  id: true,
  name: true,
  email: true,
  department: true,
  role: true,
  avatarUrl: true,
  orgRole: true,
  deactivatedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const inviteSelect = {
  id: true,
  code: true,
  role: true,
  email: true,
  maxUses: true,
  uses: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.InviteSelect;

/** Lists owners first, then admins, then members. */
const ROLE_ORDER: Record<OrgRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async get(actor: JwtPayload) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { id: true, name: true, slug: true, createdAt: true },
    });

    if (!tenant) throw new NotFoundException('Organization not found');

    const memberCount = await this.prisma.user.count({ where: { tenantId: actor.tenantId, deactivatedAt: null } });

    return { ...tenant, memberCount, myRole: actor.orgRole };
  }

  async rename(actor: JwtPayload, dto: UpdateOrganizationDto) {
    await this.prisma.tenant.update({ where: { id: actor.tenantId }, data: { name: dto.name } });

    return this.get(actor);
  }

  async members(actor: JwtPayload) {

    const members = await this.prisma.user.findMany({
      where: this.prisma.tenantWhere({}, actor.tenantId),
      select: memberSelect,
      orderBy: { createdAt: 'asc' },
    });

    return members.sort((a, b) => Number(Boolean(a.deactivatedAt)) - Number(Boolean(b.deactivatedAt)) || ROLE_ORDER[a.orgRole] - ROLE_ORDER[b.orgRole]);
  }

  /** Owner only (enforced by the controller). Setting OWNER hands ownership over. */
  async setRole(actor: JwtPayload, memberId: string, dto: UpdateMemberDto) {

    if (memberId === actor.sub)
      throw new BadRequestException('You cannot change your own role. Transfer ownership to someone else instead.');

    const member = await this.findMember(actor, memberId);

    if (member.deactivatedAt)
      throw new BadRequestException('Restore this member before changing their role');

    if (dto.orgRole === OrgRole.OWNER) {

      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: member.id }, data: { orgRole: OrgRole.OWNER } }),
        this.prisma.user.update({ where: { id: actor.sub }, data: { orgRole: OrgRole.ADMIN } }),
      ]);
    } else {
      
      await this.prisma.user.update({ where: { id: member.id }, data: { orgRole: dto.orgRole } });
    }
    return this.members(actor);
  }

  /**
   * Removes a member's access without deleting their posts or comments. Owners can remove
   * anyone else; admins can remove members only.
   */
  async deactivate(actor: JwtPayload, memberId: string) {
    const member = await this.findManageableMember(actor, memberId);
    await this.prisma.user.update({ where: { id: member.id }, data: { deactivatedAt: new Date() } });
    return this.members(actor);
  }

  async restore(actor: JwtPayload, memberId: string) {
    const member = await this.findManageableMember(actor, memberId);
    await this.prisma.user.update({ where: { id: member.id }, data: { deactivatedAt: null } });
    return this.members(actor);
  }

  invites(actor: JwtPayload) {
    return this.prisma.invite.findMany({
      where: this.prisma.tenantWhere({}, actor.tenantId),
      select: inviteSelect,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createInvite(actor: JwtPayload, dto: CreateInviteDto) {

    const role = dto.role ?? OrgRole.MEMBER;

    // No need to check for members as the OrgRoles guard already ensures that only owners and admins can create invites.
    // But we do need to check that an admin isn't trying to create another admin.
    if (role === OrgRole.ADMIN && actor.orgRole !== OrgRole.OWNER) {
      throw new ForbiddenException('Only the owner can invite admins');
    }

    const days = dto.expiresInDays ?? DEFAULT_INVITE_DAYS;

    return this.prisma.invite.create({
      data: this.prisma.tenantData(
        {
          // 144 bits of randomness, URL-safe.
          code: randomBytes(18).toString('base64url'),
          role,
          email: dto.email ?? null,
          maxUses: dto.maxUses ?? null,
          expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          createdById: actor.sub,
        },
        actor.tenantId,
      ),
      select: inviteSelect,
    });
  }

  async revokeInvite(actor: JwtPayload, inviteId: string): Promise<void> {
    const revoked = await this.prisma.invite.updateMany({
      where: this.prisma.tenantWhere({ id: inviteId, revokedAt: null }, actor.tenantId),
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw new NotFoundException('Invite not found');
  }

  /** Public preview for the sign-up page. Reveals only what the invitee needs to see. */
  async previewInvite(code: string) {
    const invite = await this.prisma.invite.findFirst({
      where: { code, ...usableInviteWhere() },
      select: { role: true, email: true, maxUses: true, uses: true, expiresAt: true, tenant: { select: { name: true } } },
    });
    if (!invite || (invite.maxUses !== null && invite.uses >= invite.maxUses)) {
      throw new NotFoundException('This invite is invalid or has expired');
    }
    return { organization: invite.tenant.name, role: invite.role, email: invite.email, expiresAt: invite.expiresAt };
  }

  private async findMember(actor: JwtPayload, memberId: string) {
    const member = await this.prisma.user.findFirst({
      where: this.prisma.tenantWhere({ id: memberId }, actor.tenantId),
      select: { id: true, orgRole: true, deactivatedAt: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  private async findManageableMember(actor: JwtPayload, memberId: string) {
    if (memberId === actor.sub) throw new BadRequestException('You cannot remove yourself');
    const member = await this.findMember(actor, memberId);
    const allowed = actor.orgRole === OrgRole.OWNER || (actor.orgRole === OrgRole.ADMIN && member.orgRole === OrgRole.MEMBER);
    if (!allowed) throw new ForbiddenException('You do not have permission to manage this member');
    return member;
  }
}
