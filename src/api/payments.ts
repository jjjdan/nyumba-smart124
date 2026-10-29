import { api } from './client';
import type { FinancialRecord } from '../types';

/**
 * Maps a backend financial_records row into the frontend's FinancialRecord type.
 */
export function mapFinancial(row: any): FinancialRecord {
  return {
    id: row.id,
    propertyId: row.property_id || '',
    propertyName: row.property_name || '',
    amount: Number(row.amount),
    date: new Date(row.created_at || row.transaction_date).toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric',
    }),
    type: row.type,
    provider: row.provider,
    senderPhoneOrAcc: row.sender_phone_or_acc || '',
    receiver: row.receiver || '',
    status: row.status,
    receiptNo: row.receipt_no,
    offline: row.is_offline_record,
    receiptPdf: row.receipt_pdf || undefined,
  };
}

export async function listFinancials(): Promise<FinancialRecord[]> {
  const res = await api.get<{ financials: any[] }>('/payments');
  return res.financials.map(mapFinancial);
}

export interface PaymentSettings {
  connected: boolean;
  keyHint: string | null;
  connectedAt: string | null;
  webhookUrl?: string;
  note?: string;
}

/** Landlord Payment Settings — Paystack secret key status (never returns the raw key). */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  return api.get<PaymentSettings>('/payments/settings');
}

export async function savePaymentSettings(secretKey: string): Promise<PaymentSettings & { message: string }> {
  return api.put('/payments/settings', { secretKey });
}

export async function disconnectPaymentSettings(): Promise<{ message: string; connected: boolean }> {
  return api.delete('/payments/settings');
}

export interface InitiatePaymentResponse {
  message: string;
  transactionId: string;
  gatewayRef?: string;
  authorizationUrl?: string | null;
  displayText?: string | null;
  receiptNo: string;
  status: string;
}

/**
 * Starts a Paystack charge using the landlord's (or platform) secret key.
 * For MoMo the tenant approves an STK/USSD push on their own phone.
 */
export async function initiatePayment(payload: {
  propertyId?: string | null;
  provider: 'MTN Mobile Money' | 'Airtel Money' | 'Bank Transfer';
  senderPhone: string;
  type?: 'Rent Payment' | 'Subscription Fee' | 'Message Billing';
  amount?: number;
}): Promise<InitiatePaymentResponse> {
  return api.post<InitiatePaymentResponse>('/payments/initiate', payload);
}

export interface PaymentStatusResponse {
  transaction: {
    id: string;
    status: 'Cleared' | 'Pending Push' | 'Pending Cloud Sync' | 'Failed';
    gateway_status: string | null;
    receipt_no: string;
    amount: number;
    provider: string;
    property_id: string | null;
    receipt_pdf?: string | null;
  };
}

export async function getPaymentStatus(transactionId: string): Promise<PaymentStatusResponse> {
  return api.get<PaymentStatusResponse>(`/payments/${transactionId}/status`);
}

/**
 * Polls payment status every `intervalMs` until it's Cleared/Failed or
 * `timeoutMs` elapses. Returns the final status.
 */
export async function pollPaymentStatus(
  transactionId: string,
  { intervalMs = 2500, timeoutMs = 60000 }: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<PaymentStatusResponse['transaction']> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const res = await getPaymentStatus(transactionId);
    if (res.transaction.status === 'Cleared' || res.transaction.status === 'Failed') {
      return res.transaction;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }

  const final = await getPaymentStatus(transactionId);
  return final.transaction;
}

/**
 * Pays the landlord's monthly subscription fee (platform Paystack account).
 */
export async function paySubscription(
  provider: 'MTN Mobile Money' | 'Airtel Money'
): Promise<InitiatePaymentResponse | { message: string }> {
  return api.post('/subscriptions/pay', { provider });
}

/**
 * Uploads queued offline payment records once connectivity returns.
 */
export interface OfflineRecord {
  localId: string;
  propertyId?: string;
  propertyName?: string;
  amount: number;
  provider: 'MTN Mobile Money' | 'Airtel Money' | 'Bank Transfer';
  senderPhone: string;
  receiver?: string;
  type?: 'Rent Payment' | 'Maintenance Cost' | 'Subscription Fee' | 'Message Billing';
  deviceId?: string;
}

export async function syncOfflinePayments(records: OfflineRecord[]) {
  return api.post<{ synced: any[]; failed: any[]; message: string }>('/payments/sync', { records });
}
