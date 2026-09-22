const TOKEN_KEY = 'udt_token';

export interface ParticipantPayload {
  type: 'participant';
  participantId: string;
  equipeId: string;
  editionId: string;
  exp: number;
}

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function decodeToken(token: string): ParticipantPayload | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload as ParticipantPayload;
  } catch {
    return null;
  }
}
