import { IsOptional, IsString, Length } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @Length(1, 2000)
  content!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}