import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  tenantData<T extends Record<string, unknown>>(data: T, tenantId?: string): T & { tenantId: string } {
    return { ...data, tenantId: this.requireTenant(tenantId) } as T & { tenantId: string };
  }

  tenantWhere<T extends Record<string, unknown>>(where: T | undefined, tenantId?: string): T & { tenantId: string } {
    return { ...(where ?? {}), tenantId: this.requireTenant(tenantId) } as T & { tenantId: string };
  }

  /** Fails closed: a query without a tenant would otherwise span every organization. */
  requireTenant(tenantId?: string): string {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is missing');
    }
    return tenantId;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL');
    } catch (error: unknown) {
      this.logger.error('PostgreSQL connection failed', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }
}
