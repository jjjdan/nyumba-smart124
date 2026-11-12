import { api } from './client';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read_at?: string;
  created_at: string;
}

export async function listNotifications(limit = 50): Promise<Notification[]> {
  const res = await api.get<{ notifications: Notification[] }>(`/notifications?limit=${limit}`);
  return res.notifications || [];
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const res = await api.patch<{ notification: Notification }>(`/notifications/${id}/read`);
  return res.notification;
}

export async function markAllNotificationsRead(): Promise<number> {
  const res = await api.post<{ updated: number }>('/notifications/read-all');
  return res.updated;
}
