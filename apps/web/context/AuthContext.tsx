'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { storeToken, getStoredToken, removeToken, decodeToken, type ParticipantPayload } from '@/lib/auth';
import { initSocket, resetSocket } from '@/lib/socket';

interface AuthState {
  token: string | null;
  payload: ParticipantPayload | null;
  loading: boolean;
  signIn: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState>({
  token: null,
  payload: null,
  loading: true,
  signIn: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [payload, setPayload] = useState<ParticipantPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      const decoded = decodeToken(stored);
      if (decoded && decoded.exp * 1000 > Date.now()) {
        setToken(stored);
        setPayload(decoded);
        initSocket(stored);
      } else {
        removeToken();
      }
    }
    setLoading(false);
  }, []);

  const signIn = useCallback((t: string) => {
    const decoded = decodeToken(t);
    if (!decoded) return;
    storeToken(t);
    setToken(t);
    setPayload(decoded);
    initSocket(t);
  }, []);

  const signOut = useCallback(() => {
    removeToken();
    resetSocket();
    setToken(null);
    setPayload(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, payload, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
