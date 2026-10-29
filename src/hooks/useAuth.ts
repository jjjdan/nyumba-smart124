import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { getAccessToken, clearTokens, ApiError } from '../api/client';
import * as authApi from '../api/auth';
import type { UserProfile } from '../types';

interface UseAuthResult {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  isLoadingSession: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (payload: {
    name: string; email: string; phone: string; password: string;
    role: 'landlord' | 'tenant'; landlordCode?: string;
  }) => Promise<UserProfile>;
  logout: () => Promise<void>;
  setCurrentUser: Dispatch<SetStateAction<UserProfile | null>>;
}

/**
 * Manages auth session: restores from stored token on mount,
 * exposes login/register/logout that talk to the real API.
 */
export function useAuth(): UseAuthResult {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setIsLoadingSession(false);
      return;
    }

    // Restore session from /auth/me
    (async () => {
      try {
        const res: any = await authApi.getCurrentUser();
        const u = res.user;
        const p = res.profile || {};
        setCurrentUser({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          landlordCode: p.landlordCode,
          propertyId: p.propertyId,
          unitsCount: p.units_count,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
        }
      } finally {
        setIsLoadingSession(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const profile = authApi.toUserProfile(res);
    setCurrentUser(profile);
    return profile;
  }, []);

  const register = useCallback(async (payload: {
    name: string; email: string; phone: string; password: string;
    role: 'landlord' | 'tenant'; landlordCode?: string;
  }) => {
    const res = await authApi.register(payload);
    const profile = authApi.toUserProfile(res);
    setCurrentUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setCurrentUser(null);
  }, []);

  return {
    currentUser,
    isAuthenticated: !!currentUser,
    isLoadingSession,
    login,
    register,
    logout,
    setCurrentUser,
  };
}
