import { api } from './client';
import type { Property } from '../types';

/**
 * Maps a backend snake_case property row into the frontend's camelCase Property type.
 */
export function mapProperty(row: any): Property {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    tenantName: row.tenant_name || '',
    tenantPhone: row.tenant_phone || '',
    monthlyRent: Number(row.monthly_rent),
    status: row.status,
    landlordCode: row.landlord_code,
  };
}

export async function listProperties(): Promise<Property[]> {
  const res = await api.get<{ properties: any[] }>('/properties');
  return res.properties.map(mapProperty);
}

export async function getProperty(id: string): Promise<Property> {
  const res = await api.get<{ property: any }>(`/properties/${id}`);
  return mapProperty(res.property);
}

export async function createProperty(payload: {
  name: string;
  address: string;
  tenantName: string;
  tenantPhone: string;
  monthlyRent: number;
}): Promise<Property> {
  const res = await api.post<{ property: any }>('/properties', payload);
  return mapProperty(res.property);
}

export async function updateProperty(id: string, payload: Partial<{
  name: string;
  address: string;
  tenantName: string;
  tenantPhone: string;
  monthlyRent: number;
  status: Property['status'];
}>): Promise<Property> {
  const res = await api.patch<{ property: any }>(`/properties/${id}`, payload);
  return mapProperty(res.property);
}

export async function deleteProperty(id: string): Promise<void> {
  await api.delete(`/properties/${id}`);
}
