// ─────────────────────────────────────────────────────────────────────────────
// Auth / JWT
// ─────────────────────────────────────────────────────────────────────────────

export type RoleUser = 'SUPER_ADMIN' | 'ORGANISATEUR' | 'QG';
export type RoleParticipant = 'CAPITAINE' | 'MEMBRE';

export interface UserTokenPayload {
  type: 'user';
  userId: string;
  role: RoleUser;
}

export interface ParticipantTokenPayload {
  type: 'participant';
  participantId: string;
  equipeId: string;
  editionId: string;
}

export type TokenPayload = UserTokenPayload | ParticipantTokenPayload;

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket events
// ─────────────────────────────────────────────────────────────────────────────

export type WsEventType =
  | 'validation:new'
  | 'validation:pending'
  | 'validation:approved'
  | 'validation:rejected'
  | 'score:update'
  | 'classement:update'
  | 'checkpoint:revealed'
  | 'message:qg'
  | 'edition:started'
  | 'edition:finished';

export interface WsEvent<T = unknown> {
  type: WsEventType;
  editionId: string;
  data: T;
  timestamp: string;
}

export interface CheckpointRevealedData {
  editionId: string;
  phase: 'depart' | 'checkpoints' | 'points';
  timestamp: string;
}

export interface ScoreUpdateData {
  equipeId: string;
  scoreTotal: number;
  distanceVolOiseauKm: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classement
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Messages QG
// ─────────────────────────────────────────────────────────────────────────────

export type TypeMessage = 'INFO' | 'ALERTE' | 'METEO';

export interface MessageQG {
  id: string;
  editionId: string;
  contenu: string;
  type: TypeMessage;
  timestamp: string;
  auteurId: string;
}
