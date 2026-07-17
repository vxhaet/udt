const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function getToken(): string {
  if (typeof document === 'undefined') return '';
  return document.cookie.match(/udt_token=([^;]+)/)?.[1] ?? '';
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types partagés
// ─────────────────────────────────────────────────────────────────────────────

export interface Edition {
  id: string;
  nom: string;
  slug?: string | null;
  description?: string | null;
  reglement?: string | null;
  nb_participants_par_equipe: number;
  solo_autorise: boolean;
  date_course: string;
  duree_minutes: number;
  nb_equipes_max: number;
  prix_equipe: number;
  statut: 'BROUILLON' | 'INSCRIPTION' | 'EN_COURS' | 'TERMINE' | 'ARCHIVE';
  devoilement_depart: string;
  devoilement_checkpoints: string;
  devoilement_points: string;
  gel_classement: string;
  point_depart_lat?: number | null;
  point_depart_lng?: number | null;
  point_arrivee_lat?: number | null;
  point_arrivee_lng?: number | null;
  _count?: { equipes: number; checkpoints: number };
}

export interface PendingValidation {
  id: string;
  equipe_id: string;
  checkpoint_id: string;
  latitude: number;
  longitude: number;
  photo_url?: string | null;
  statut: 'EN_ATTENTE' | 'APPROUVE' | 'REJETE';
  points_accordes: number;
  created_at: string;
  equipe: { id: string; nom: string };
  checkpoint: { id: string; nom: string; points: number; edition_id: string };
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

export interface Checkpoint {
  id: string;
  nom: string;
  latitude: number;
  longitude: number;
  points?: number;
  type_validation: 'AUTO' | 'MANUELLE' | 'MIXTE';
  actif: boolean;
  ordre_affichage?: number | null;
}

export interface FormatCourse {
  id: string;
  edition_id: string;
  nom: string;
  duree_minutes: number;
  created_at: string;
}

export interface CheckpointAdmin {
  id: string;
  nom: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  points: number;
  rayon_validation_metres: number;
  type_validation: 'AUTO' | 'MANUELLE' | 'MIXTE';
  disparait_apres_passage: boolean;
  actif: boolean;
  ordre_affichage?: number | null;
  type: 'NORMAL' | 'DEPART' | 'ARRIVEE' | 'EPHEMERE_QG';
  tous_formats: boolean;
  formats: { id: string; nom: string; duree_minutes: number }[];
  expires_at?: string | null;
  regles?: RegleCheckpoint[];
}

export interface RegleCheckpoint {
  id: string;
  type_regle: 'IMPOSE_SUIVANT' | 'EXCLUSIF_AVEC' | 'BONUS_SI_ORDRE';
  checkpoint_cible_id?: string | null;
  parametres: Record<string, unknown>;
}

export interface ItineraireThematique {
  id: string;
  edition_id: string;
  nom: string;
  description?: string | null;
  points_bonus: number;
  actif: boolean;
  checkpoints: { id: string; nom: string; points: number }[];
  _count?: { completes: number };
}

export interface ConfigEdition {
  edition_id: string;
  checkpoints_disparaissent_actif: boolean;
  checkpoint_suivant_impose_actif: boolean;
  itineraires_thematiques_actif: boolean;
  checkpoint_ephemere_qg_actif: boolean;
  segments_strava_actif: boolean;
  gel_classement_actif: boolean;
  devoilement_progressif_actif: boolean;
  ephemere_qg_duree_minutes: number;
  ephemere_qg_points_defaut: number;
}

export interface CarteData {
  depart: { lat: number; lng: number } | null;
  arrivee: { lat: number; lng: number } | null;
  checkpoints: Checkpoint[];
  validations: { equipe_id: string; checkpoint_id: string; validated_at: string }[];
}

export interface ArchivedEdition {
  id: string;
  nom: string;
  description?: string | null;
  date_course: string;
  duree_minutes: number;
  _count: { equipes: number };
}

export interface ArchiveCheckpointValidation {
  equipe_id: string;
  equipe_nom: string;
  photo_url?: string | null;
  validated_at: string;
  points_accordes: number;
}

export interface ArchiveCheckpoint {
  id: string;
  nom: string;
  latitude: number;
  longitude: number;
  points: number;
  type: string;
  validations: ArchiveCheckpointValidation[];
}

export interface ArchiveSegmentPerformance {
  classement: number;
  temps_secondes: number;
  points_gagnes: number;
  participant_nom: string;
  equipe_nom: string;
}

export interface ArchiveSegment {
  id: string;
  nom: string;
  strava_segment_id: string;
  points_premier: number;
  points_second: number;
  points_troisieme: number;
  performances: ArchiveSegmentPerformance[];
}

export interface ArchiveClassementEntry {
  rang: number;
  equipeId: string;
  nom: string;
  scoreTotal: number;
  distanceVolOiseauKm: number;
  nbCheckpoints: number;
  heureArrivee?: string | null;
  statut: string;
}

export interface ArchiveData {
  edition: {
    id: string;
    nom: string;
    description?: string | null;
    date_course: string;
    duree_minutes: number;
    statut: string;
  };
  classement: ArchiveClassementEntry[];
  checkpoints: ArchiveCheckpoint[];
  segments: ArchiveSegment[];
}

export interface PerformanceStravaDetail {
  id: string;
  temps_secondes: number;
  classement: number;
  points_gagnes: number;
  participant: {
    nom: string;
    prenom: string;
    equipe: { nom: string };
  };
}

export interface SegmentStrava {
  id: string;
  edition_id: string;
  strava_segment_id: string;
  nom: string;
  description?: string | null;
  points_premier: number;
  points_second: number;
  points_troisieme: number;
  performances: PerformanceStravaDetail[];
}
