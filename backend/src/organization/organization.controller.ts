import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { CurrentUser, JwtAuthGuard, OrgRoles, OrgRolesGuard } from '../auth/guards';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreateInviteDto, UpdateMemberDto, UpdateOrganizationDto } from './dto';
import { OrganizationService } from './organization.service';

/** The signed-in user's organization: settings, members and invites. */
@UseGuards(JwtAuthGuard, OrgRolesGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.organization.get(user);
  }

  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @Patch()
  rename(@CurrentUser() user: JwtPayload, @Body() dto: UpdateOrganizationDto) {
    return this.organization.rename(user, dto);
  }

  @Get('members')
  members(@CurrentUser() user: JwtPayload) {
    return this.organization.members(user);
  }

  @OrgRoles(OrgRole.OWNER)
  @Patch('members/:id')
  setRole(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.organization.setRole(user, id, dto);
  }

  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @Delete('members/:id')
  deactivate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.organization.deactivate(user, id);
  }

  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @Post('members/:id/restore')
  @HttpCode(200)
  restore(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.organization.restore(user, id);
  }

  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @Get('invites')
  invites(@CurrentUser() user: JwtPayload) {
    return this.organization.invites(user);
  }

  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @Post('invites')
  createInvite(@CurrentUser() user: JwtPayload, @Body() dto: CreateInviteDto) {
    return this.organization.createInvite(user, dto);
  }

  @OrgRoles(OrgRole.OWNER, OrgRole.ADMIN)
  @Delete('invites/:id')
  async revokeInvite(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.organization.revokeInvite(user, id);
    return { success: true };
  }
}

/** Unauthenticated: lets the sign-up page show which organization an invite link joins. */
@Controller('invites')
export class InvitesController {
  constructor(private readonly organization: OrganizationService) {}

  @Get(':code')
  preview(@Param('code') code: string) {
    return this.organization.previewInvite(code);
  }
}
