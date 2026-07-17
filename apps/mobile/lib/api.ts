import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────────────────────

export const TOKEN_KEY = 'udt_token';

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function storeToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function removeToken(): Promise<void> {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Décode le payload JWT sans vérification (la vérification est côté serveur). */
export function decodeToken(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch wrapper
// ─────────────────────────────────────────────────────────────────────────────

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getStoredToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as {
      error?: string;
      details?: { path: string; message: string }[];
    };
    const base = err.error ?? `HTTP ${res.status}`;
    const detail = err.details?.map((d) => `${d.path}: ${d.message}`).join(', ');
    console.log('[apiFetch] erreur', res.status, base, detail ?? '');
    throw new Error(detail ? `${base} — ${detail}` : base);
  }
  return res.json() as Promise<T>;
}

/** Upload multipart (pour les photos de validation). */
export async function uploadFile(uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const token = await getStoredToken();
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: `photo_${Date.now()}.jpg`,
    type: mimeType,
  } as unknown as Blob);

  const res = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload échoué' }));
    throw new Error((err as { error?: string }).error ?? 'Upload échoué');
  }
  const { url } = await res.json() as { url: string };
  return url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Checkpoint {
  id: string;
  nom: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  points?: number;
  rayon_validation_metres: number;
  type_validation: 'AUTO' | 'MANUELLE' | 'MIXTE';
  type?: 'NORMAL' | 'DEPART' | 'ARRIVEE' | 'EPHEMERE_QG';
  actif: boolean;
  ordre_affichage?: number | null;
}

export interface CarteData {
  depart: { lat: number; lng: number } | null;
  arrivee: { lat: number; lng: number } | null;
  checkpoints: Checkpoint[];
  validations: { equipe_id: string; checkpoint_id: string; validated_at: string }[];
}

export interface ClassementEntry {
  rang: number;
  equipeId: string;
  nom: string;
  scoreTotal: number;
  distanceVolOiseauKm: number;
  nbCheckpoints: number;
  heureArrivee?: string | null;
  statut: string;
  format_course?: { id: string; nom: string; duree_minutes: number } | null;
  dernier_checkpoint?: { nom: string; validated_at: string } | null;
}
