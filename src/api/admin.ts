import { api } from './client';
import type { SubscriptionTier } from '../types';

export function mapTier(row: any): SubscriptionTier {
  return {
    id: row.id,
    name: row.name,
    minUnits: row.min_units,
    maxUnits: row.max_units,
    pricePerMonth: Number(row.price_per_month),
  };
}

export async function listTiers(): Promise<SubscriptionTier[]> {
  const res = await api.get<{ tiers: any[] }>('/admin/tiers');
  return res.tiers.map(mapTier);
}

export async function updateTiers(tiers: SubscriptionTier[]): Promise<SubscriptionTier[]> {
  const res = await api.put<{ tiers: any[] }>('/admin/tiers', {
    tiers: tiers.map(t => ({
      name: t.name,
      minUnits: t.minUnits,
      maxUnits: t.maxUnits,
      pricePerMonth: t.pricePerMonth,
    })),
  });
  return res.tiers.map(mapTier);
}

export interface AdminDashboard {
  users: { landlords: number; tenants: number; admins: number; total: number };
  properties: { paid: number; overdue: number; partiallyPaid: number; vacant: number; total: number };
  revenue: { subscriptions: number; rentProcessed: number; smsRevenue: number; totalTransactions: number };
  complaints: { received: number; inProgress: number; settled: number };
  subscriptionBreakdown: Array<{ name: string; landlord_count: string }>;
}

export async function getDashboard(): Promise<AdminDashboard> {
  return api.get<AdminDashboard>('/admin/dashboard');
}

export async function getPayoutSettings(): Promise<{ momoDetails: string; bankDetails: string }> {
  return api.get('/admin/payout-settings');
}

export async function getAuditLogs(limit = 100) {
  return api.get<{ logs: any[] }>(`/admin/logs?limit=${limit}`);
}
