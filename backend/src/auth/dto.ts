import { Department } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Length, MinLength, MaxLength, Matches } from 'class-validator';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class RegisterDto {

  @IsEmail() email!: string;
  @IsString() @Length(2, 60) name!: string;

  @IsString() @MinLength(8) @MaxLength(128) password!: string;

  /** The department the user belongs to; also the default department for their posts. */
  @IsEnum(Department, { message: `department must be one of: ${Object.values(Department).join(', ')}` }) department!: Department;
  
  /** Free-text job title for now, e.g. "Engineer" or "Sales Associate". */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @Length(2, 60) role!: string;

  /** Name of the new organization to create. Ignored when joining with an invite. */
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @Length(2, 60) tenantName?: string;

  /** Joins the invite's organization instead of creating a new one. */
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @Length(6, 64) inviteCode?: string;
}

export class LoginDto{

  @IsEmail() email!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() @Matches(slugPattern, { message: 'tenantSlug must be lowercase letters, numbers, and dashes only' }) tenantSlug?: string;
  
}
