import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly tenantContext: TenantContextService) {
    super();
  }

  tenantData<T extends Record<string, unknown>>(data: T, tenantId?: string): T & { tenantId: string } {
    const resolvedTenantId = tenantId ?? this.tenantContext.getCurrentTenantId() ?? this.tenantContext.requireCurrentTenantId();
    return { ...data, tenantId: resolvedTenantId } as T & { tenantId: string };
  }

  tenantWhere<T extends Record<string, unknown>>(where: T | undefined, tenantId?: string): T & { tenantId: string } {
    const resolvedTenantId = tenantId ?? this.tenantContext.getCurrentTenantId() ?? this.tenantContext.requireCurrentTenantId();
    return { ...(where ?? {}), tenantId: resolvedTenantId } as T & { tenantId: string };
  }

  requireTenant(tenantId?: string): string {
    const resolvedTenantId = tenantId ?? this.tenantContext.getCurrentTenantId();
    if (!resolvedTenantId) {
      throw new ForbiddenException('Tenant context is missing');
    }
    return resolvedTenantId;
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
