import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, Length, Max, Min } from 'class-validator';


export class CreatePostDto {
  @IsString() @Length(3, 160) title!: string;
  @IsOptional() @IsString() @Length(0, 300) excerpt?: string;
  @IsString() @Length(1, 50000) content!: string;
  @IsOptional() @IsString() @Length(0, 2048) coverImage?: string;
  @IsOptional() @IsString() @Length(0, 255) imageAlt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() published?: boolean;
}
export class UpdatePostDto {
  @IsOptional() @IsString() @Length(3, 160) title?: string;
  @IsOptional() @IsString() @Length(0, 300) excerpt?: string;
  @IsOptional() @IsString() @Length(1, 50000) content?: string;
  @IsOptional() @IsString() @Length(0, 2048) coverImage?: string;
  @IsOptional() @IsString() @Length(0, 255) imageAlt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() published?: boolean;
}
export class ListPostsDto {
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(50) limit = 10;
  @IsOptional() @IsString() tag?: string;
}
