import { IsString, Length } from 'class-validator';

export class RagAskDto {
  @IsString()
  @Length(1, 2000)
  query!: string;
}
