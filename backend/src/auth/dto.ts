import { IsEmail, IsOptional, IsString, Length, MinLength, Matches } from 'class-validator';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @Length(2, 60) name!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() @Length(2, 60) tenantName?: string;
  @IsOptional() @IsString() @Matches(slugPattern, { message: 'tenantSlug must be lowercase letters, numbers, and dashes only' }) tenantSlug?: string;
}

export class LoginDLog{
  @IsEmail() email!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() @Matches(slugPattern, { message: 'tenantSlug must be lowercase letters, numbers, and dashes only' }) tenantSlug?: string;
}
