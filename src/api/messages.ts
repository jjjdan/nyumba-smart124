import { api } from './client';
import type { InAppMessage } from '../types';

export function mapMessage(row: any): InAppMessage {
  return {
    id: row.id,
    landlordCode: row.landlord_code,
    tenantPhone: row.tenant_phone || undefined,
    text: row.text,
    date: new Date(row.created_at).toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric',
    }),
    sender: row.sender_role,
  };
}

export async function listMessages(): Promise<InAppMessage[]> {
  const res = await api.get<{ messages: any[] }>('/messages');
  return res.messages.map(mapMessage);
}

/**
 * Sends an overdue-rent SMS reminder. Pass propertyId for a single tenant,
 * or omit to notify all overdue tenants under this landlord.
 */
export async function sendReminder(propertyId?: string) {
  return api.post<{ message: string; sent: number; cost: number }>(
    '/messages/reminder',
    propertyId ? { propertyId } : {}
  );
}

export async function sendBroadcast(text: string) {
  return api.post<{
    message: string;
    sent: number;
    cost: number;
    recipientCount: number;
    localOnly?: boolean;
  }>(
    '/messages/broadcast',
    { text }
  );
}

export interface SmsBilling {
  outstanding: number;
  totalPaid: number;
  lastPaidAt: string | null;
}

export async function getSmsBilling(): Promise<SmsBilling> {
  return api.get<SmsBilling>('/messages/billing');
}

export async function settleSmsBilling(receiptNo: string) {
  return api.post<{ message: string; amountSettled: number }>('/messages/billing/settle', { receiptNo });
}
