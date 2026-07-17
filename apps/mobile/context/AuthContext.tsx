import React, { createContext, useContext, useEffect, useState } from 'react';
import { getStoredToken, storeToken, removeToken, decodeToken } from '@/lib/api';
import { initSocket, resetSocket } from '@/lib/socket';

interface AuthState {
  token: string | null;
  participantId: string | null;
  equipeId: string | null;
  editionId: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    participantId: null,
    equipeId: null,
    editionId: null,
    isLoading: true,
  });

  // Restaurer la session au démarrage
  useEffect(() => {
    getStoredToken().then((token) => {
      if (token) {
        applyToken(token);
      } else {
        setState((s) => ({ ...s, isLoading: false }));
      }
    });
  }, []);

  function applyToken(token: string) {
    const payload = decodeToken(token);
    setState({
      token,
      participantId: payload.participantId as string ?? null,
      equipeId: payload.equipeId as string ?? null,
      editionId: payload.editionId as string ?? null,
      isLoading: false,
    });
    initSocket(token);
  }

  async function signIn(token: string) {
    await storeToken(token);
    applyToken(token);
  }

  async function signOut() {
    await removeToken();
    resetSocket();
    setState({ token: null, participantId: null, equipeId: null, editionId: null, isLoading: false });
  }

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
