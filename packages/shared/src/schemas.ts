import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// ─────────────────────────────────────────────────────────────────────────────
// Edition
// ─────────────────────────────────────────────────────────────────────────────

export const CreateEditionSchema = z.object({
  nom: z.string().min(2).max(100),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional(),
  reglement: z.string().optional(),
  nb_participants_par_equipe: z.number().int().min(1).max(10).default(4),
  solo_autorise: z.boolean().default(false),
  date_course: z.string().datetime(),
  duree_minutes: z.number().int().min(30).max(1440),
  nb_equipes_max: z.number().int().min(1).max(500),
  prix_equipe: z.number().int().min(0).default(0),
  point_depart_lat: z.number().min(-90).max(90).optional(),
  point_depart_lng: z.number().min(-180).max(180).optional(),
  point_arrivee_lat: z.number().min(-90).max(90).optional(),
  point_arrivee_lng: z.number().min(-180).max(180).optional(),
  devoilement_depart: z.string().datetime(),
  devoilement_checkpoints: z.string().datetime(),
  devoilement_points: z.string().datetime(),
  gel_classement: z.string().datetime(),
});

export const UpdateEditionSchema = CreateEditionSchema.partial().extend({
  statut: z.enum(['BROUILLON', 'INSCRIPTION', 'EN_COURS', 'TERMINE', 'ARCHIVE']).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint
// ─────────────────────────────────────────────────────────────────────────────

export const CreateCheckpointSchema = z.object({
  nom: z.string().min(1).max(100),
  description: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  points: z.number().int().min(0),
  rayon_validation_metres: z.number().int().min(10).max(500).default(50),
  type_validation: z.enum(['AUTO', 'MANUELLE', 'MIXTE']).default('AUTO'),
  disparait_apres_passage: z.boolean().default(false),
  ordre_affichage: z.number().int().optional(),
  type: z.enum(['NORMAL', 'DEPART', 'ARRIVEE', 'EPHEMERE_QG']).default('NORMAL'),
  tous_formats: z.boolean().default(true),
  format_course_ids: z.array(z.string()).default([]),
});

export const CreateFormatCourseSchema = z.object({
  nom: z.string().min(1).max(50),
  duree_minutes: z.number().int().min(30),
});

export const CreateRegleSchema = z.object({
  type_regle: z.enum(['IMPOSE_SUIVANT', 'EXCLUSIF_AVEC', 'BONUS_SI_ORDRE']),
  checkpoint_cible_id: z.string().cuid().optional(),
  parametres: z.record(z.any()).default({}),
});

// ─────────────────────────────────────────────────────────────────────────────
// Equipe
// ─────────────────────────────────────────────────────────────────────────────

export const CreateEquipeSchema = z.object({
  editionId: z.string().cuid(),
  nom: z.string().min(2).max(50),
  capitaine: z.object({
    nom: z.string().min(1).max(50),
    prenom: z.string().min(1).max(50),
    email: z.string().email(),
  }),
});

export const InscriptionSchema = z.object({
  nom_equipe: z.string().min(2).max(50),
  capitaine: z.object({
    nom: z.string().min(1).max(50),
    prenom: z.string().min(1).max(50),
    email: z.string().email(),
  }),
  emails_membres: z.array(z.string().email()).max(3).default([]),
  format_course_id: z.string().optional(),
  platform: z.enum(['web', 'mobile']).default('web'),
});

export const JoinEquipeSchema = z.object({
  code_acces: z.string().length(8),
  nom: z.string().min(1).max(50),
  prenom: z.string().min(1).max(50),
  email: z.string().email(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export const CreateValidationSchema = z.object({
  checkpointId: z.string().cuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  photo_url: z.string().url(),
});

export const PatchValidationSchema = z.object({
  statut: z.enum(['APPROUVE', 'REJETE']),
  commentaire_admin: z.string().max(500).optional(),
  points_accordes: z.number().int().min(0).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Message QG
// ─────────────────────────────────────────────────────────────────────────────

export const CreateMessageSchema = z.object({
  contenu: z.string().min(1).max(500),
  type: z.enum(['INFO', 'ALERTE', 'METEO']).default('INFO'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Itinéraire thématique
// ─────────────────────────────────────────────────────────────────────────────

export const CreateItineraireThematiqueSchema = z.object({
  nom: z.string().min(1).max(100),
  description: z.string().optional(),
  points_bonus: z.number().int().min(0).default(0),
  actif: z.boolean().default(true),
  checkpoint_ids: z.array(z.string().cuid()).default([]),
});

// ─────────────────────────────────────────────────────────────────────────────
// ConfigEdition
// ─────────────────────────────────────────────────────────────────────────────

export const UpdateConfigEditionSchema = z.object({
  checkpoints_disparaissent_actif: z.boolean().optional(),
  checkpoint_suivant_impose_actif: z.boolean().optional(),
  itineraires_thematiques_actif: z.boolean().optional(),
  checkpoint_ephemere_qg_actif: z.boolean().optional(),
  segments_strava_actif: z.boolean().optional(),
  gel_classement_actif: z.boolean().optional(),
  devoilement_progressif_actif: z.boolean().optional(),
  ephemere_qg_duree_minutes: z.number().int().min(1).max(1440).optional(),
  ephemere_qg_points_defaut: z.number().int().min(0).optional(),
});
