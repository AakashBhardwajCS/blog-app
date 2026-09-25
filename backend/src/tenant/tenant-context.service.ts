import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantContextState = { tenantId: string };

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContextState>();

  runWithTenant<T>(tenantId: string, callback: () => T): T {
    if (!tenantId) throw new Error('Tenant id is required');
    return this.storage.run({ tenantId }, callback);
  }

  getCurrentTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  requireCurrentTenantId(): string {
    const tenantId = this.getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant context is missing');
    return tenantId;
  }
}
