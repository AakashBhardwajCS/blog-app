import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @Length(2, 60) name!: string;
  @IsString() @MinLength(8) password!: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
