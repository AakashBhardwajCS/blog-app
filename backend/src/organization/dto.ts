import { OrgRole } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateOrganizationDto {
  @Transform(trim) @IsString() @Length(2, 60) name!: string;
}

export class UpdateMemberDto {
  /** Setting OWNER transfers ownership; the current owner becomes an admin. */
  @IsIn(Object.values(OrgRole)) orgRole!: OrgRole;
}

export class CreateInviteDto {
  @IsOptional() @IsIn([OrgRole.ADMIN, OrgRole.MEMBER]) role?: OrgRole;
  /** Restricts the invite to one email address. */
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || undefined : value)) @IsEmail() email?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) expiresInDays?: number;
  /** Omit for unlimited uses until the invite expires. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) maxUses?: number;
}
