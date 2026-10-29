import { api } from './client';
import type { Complaint } from '../types';

export function mapComplaint(row: any): Complaint {
  return {
    id: row.id,
    propertyId: row.property_id || '',
    propertyName: row.property_name || '',
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    priority: row.priority,
    raisedBy: row.raised_by_name || '',
    date: new Date(row.created_at).toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric',
    }),
    offline: row.is_offline_record,
  };
}

export async function listComplaints(): Promise<Complaint[]> {
  const res = await api.get<{ complaints: any[] }>('/complaints');
  return res.complaints.map(mapComplaint);
}

export async function createComplaint(payload: {
  propertyId: string;
  title: string;
  description: string;
  category: Complaint['category'];
  priority: Complaint['priority'];
}): Promise<Complaint> {
  const res = await api.post<{ complaint: any }>('/complaints', payload);
  return mapComplaint(res.complaint);
}

export async function updateComplaint(id: string, payload: {
  status?: Complaint['status'];
  priority?: Complaint['priority'];
}): Promise<Complaint> {
  const res = await api.patch<{ complaint: any }>(`/complaints/${id}`, payload);
  return mapComplaint(res.complaint);
}

export interface OfflineComplaint {
  localId: string;
  propertyId: string;
  propertyName?: string;
  title: string;
  description: string;
  category: Complaint['category'];
  priority: Complaint['priority'];
  deviceId?: string;
}

export async function syncOfflineComplaints(complaints: OfflineComplaint[]) {
  return api.post<{ synced: any[]; failed: any[]; message: string }>('/complaints/sync', { complaints });
}
