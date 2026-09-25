import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentTenant, JwtAuthGuard } from '../auth/guards';
import { RagAskDto } from './dto';
import { RagService } from './rag.service';

@Controller('rag')
export class RagController {
  constructor(private readonly rag: RagService) {}

  @UseGuards(JwtAuthGuard)
  @Post('ask')
  ask(@CurrentTenant() tenantId: string, @Body() dto: RagAskDto) {
    return this.rag.ask(dto.query, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('index')
  index(@CurrentTenant() tenantId: string) {
    return this.rag.syncPublishedPosts(tenantId);
  }
}
