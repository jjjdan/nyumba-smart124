import { api } from './client';

export async function archiveReceipt(id: string): Promise<{ message: string; receipt: any }> {
  return api.patch(`/receipts/${id}/archive`);
}
