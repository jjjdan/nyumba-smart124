/**
 * Nyumba Smart — API Client
 * Thin fetch wrapper that injects JWT, handles 401 refresh, and
 * normalizes errors so UI code can just `await` and `catch`.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const TOKEN_KEY = 'sl_access_token';
const REFRESH_KEY = 'sl_refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  status: number;
  details?: any;
  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let refreshPromise: Promise<string | null> | null = null;

/**
 * Attempts to refresh the access token using the stored refresh token.
 * De-duplicates concurrent refresh attempts.
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        if (data.accessToken) {
          setTokens(data.accessToken);
          return data.accessToken;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => { refreshPromise = null; });
  }

  return refreshPromise;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: any;
  skipAuth?: boolean; // for public endpoints (login, register, webhooks)
}

/**
 * Core request function. Automatically attaches Bearer token and
 * retries once on 401 after refreshing the token.
 */
export async function apiRequest<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipAuth = false } = opts;

  const doFetch = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token && !skipAuth) headers.Authorization = `Bearer ${token}`;

    return fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let token = skipAuth ? null : getAccessToken();
  let response = await doFetch(token);

  // If unauthorized and we have a refresh token, try once more
  if (response.status === 401 && !skipAuth && getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await doFetch(newToken);
    }
  }

  if (response.status === 204) return undefined as T;

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // No JSON body (e.g. some 202 responses) — leave data null
  }

  if (!response.ok) {
    throw new ApiError(
      data?.error || `Request failed with status ${response.status}`,
      response.status,
      data?.details
    );
  }

  return data as T;
}

export const api = {
  get:    <T = any>(path: string) => apiRequest<T>(path, { method: 'GET' }),
  post:   <T = any>(path: string, body?: any, opts?: Partial<RequestOptions>) =>
            apiRequest<T>(path, { method: 'POST', body, ...opts }),
  patch:  <T = any>(path: string, body?: any) => apiRequest<T>(path, { method: 'PATCH', body }),
  put:    <T = any>(path: string, body?: any) => apiRequest<T>(path, { method: 'PUT', body }),
  delete: <T = any>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

export { API_BASE_URL };
