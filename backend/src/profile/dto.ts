import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Editable profile fields. Email and department are intentionally not editable here. */
export class UpdateProfileDto {
  @IsOptional() @Transform(trim) @IsString() @Length(2, 60) name?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(2, 60) role?: string;
}
