import { Department } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, Max, Min } from 'class-validator';


export class CreatePostDto {
  @IsString() @Length(3, 160) title!: string;
  @IsOptional() @IsString() @Length(0, 300) excerpt?: string;
  @IsString() @Length(1, 50000) content!: string;
  @IsOptional() @IsString() @Length(0, 2048) coverImage?: string;
  @IsOptional() @IsString() @Length(0, 255) imageAlt?: string;
  // No `department`: a post is always filed under its author's department (set server-side).
  @IsOptional() @IsBoolean() published?: boolean;
}
export class UpdatePostDto {
  @IsOptional() @IsString() @Length(3, 160) title?: string;
  @IsOptional() @IsString() @Length(0, 300) excerpt?: string;
  @IsOptional() @IsString() @Length(1, 50000) content?: string;
  @IsOptional() @IsString() @Length(0, 2048) coverImage?: string;
  @IsOptional() @IsString() @Length(0, 255) imageAlt?: string;
  @IsOptional() @IsBoolean() published?: boolean;
}
export class ListPostsDto {
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(50) limit = 10;
  /** Only return posts filed under this department. */
  @IsOptional() @IsEnum(Department) department?: Department;
}

export class SearchPostsDto {
  @IsString() @Length(1, 200) q!: string;
  /** Only return posts filed under this department. */
  @IsOptional() @IsEnum(Department) department?: Department;
  @IsOptional() @Type(() => Number) @Min(1) @Max(50) limit = 20;
}
