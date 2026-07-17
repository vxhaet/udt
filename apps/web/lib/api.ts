const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FormatCourse {
  id: string;
  nom: string;
  duree_minutes: number;
}

export interface EditionPublic {
  id: string;
  nom: string;
  slug: string | null;
  description: string | null;
  reglement: string | null;
  date_course: string;
  duree_minutes: number;
  nb_equipes_max: number;
  nb_participants_par_equipe: number;
  solo_autorise: boolean;
  prix_equipe: number;
  statut: 'BROUILLON' | 'INSCRIPTION' | 'EN_COURS' | 'TERMINE' | 'ARCHIVE';
  formats: FormatCourse[];
  _count: { equipes: number };
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
}

export interface CarteCheckpoint {
  id: string;
  nom: string;
  latitude: number;
  longitude: number;
  type?: 'NORMAL' | 'DEPART' | 'ARRIVEE' | 'EPHEMERE_QG';
  ordre_affichage?: number | null;
}

export interface CarteData {
  depart: { lat: number; lng: number } | null;
  arrivee: { lat: number; lng: number } | null;
  checkpoints: CarteCheckpoint[];
  validations: { equipe_id: string; checkpoint_id: string; validated_at: string }[];
}
