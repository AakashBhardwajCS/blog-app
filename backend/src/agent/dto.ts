import { IsOptional, IsString, Length } from 'class-validator';

export class AgentChatDto {
  @IsString()
  @Length(1, 10000)
  message!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  toolName?: string;
}