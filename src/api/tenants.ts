import { api } from './client';

export async function archiveTenant(id: string): Promise<{ tenantId: string; message: string }> {
  return api.patch(`/tenants/${id}/archive`);
}

export async function unlinkTenant(id: string): Promise<{ tenantId: string; message: string }> {
  return api.patch(`/tenants/${id}/unlink`);
}
