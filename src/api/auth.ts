import { api, setTokens, clearTokens, getRefreshToken } from './client';
import type { UserProfile } from '../types';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: 'landlord' | 'tenant' | 'admin';
  };
  profile: {
    landlordCode?: string;
    landlordRowId?: string;
    propertyId?: string;
    units_count?: number;
  };
}

/**
 * Converts the backend's flat user+profile response into the frontend's
 * combined UserProfile shape used throughout the UI.
 */
export function toUserProfile(res: AuthResponse): UserProfile {
  return {
    id: res.user.id,
    name: res.user.name,
    email: res.user.email,
    phone: res.user.phone,
    role: res.user.role,
    landlordCode: res.profile?.landlordCode,
    propertyId: res.profile?.propertyId,
    unitsCount: res.profile?.units_count,
  };
}

/**
 * Registers a new landlord or tenant.
 * Phone must be normalized to +256XXXXXXXXX (no spaces) before calling.
 */
export async function register(payload: {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: 'landlord' | 'tenant';
  landlordCode?: string;
}): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/register', payload, { skipAuth: true });
  setTokens(res.accessToken, res.refreshToken);
  return res;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/login', { email, password }, { skipAuth: true });
  setTokens(res.accessToken, res.refreshToken);
  return res;
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    await api.post('/auth/logout', { refreshToken });
  } catch {
    // Ignore — we're clearing tokens locally regardless
  } finally {
    clearTokens();
  }
}

export async function getCurrentUser() {
  return api.get('/auth/me');
}
