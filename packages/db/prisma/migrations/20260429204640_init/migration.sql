-- CreateEnum
CREATE TYPE "StatutEdition" AS ENUM ('BROUILLON', 'INSCRIPTION', 'EN_COURS', 'TERMINE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "TypeValidation" AS ENUM ('AUTO', 'MANUELLE', 'MIXTE');

-- CreateEnum
CREATE TYPE "TypeRegle" AS ENUM ('IMPOSE_SUIVANT', 'EXCLUSIF_AVEC', 'BONUS_SI_ORDRE');

-- CreateEnum
CREATE TYPE "StatutEquipe" AS ENUM ('INSCRITE', 'CONFIRMEE', 'EN_COURSE', 'ARRIVEE', 'DISQUALIFIEE');

-- CreateEnum
CREATE TYPE "RoleParticipant" AS ENUM ('CAPITAINE', 'MEMBRE');

-- CreateEnum
CREATE TYPE "StatutValidation" AS ENUM ('EN_ATTENTE', 'APPROUVE', 'REJETE');

-- CreateEnum
CREATE TYPE "RoleUser" AS ENUM ('SUPER_ADMIN', 'ORGANISATEUR', 'QG');

-- CreateTable
CREATE TABLE "Edition" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "date_course" TIMESTAMP(3) NOT NULL,
    "duree_minutes" INTEGER NOT NULL,
    "nb_equipes_max" INTEGER NOT NULL,
    "point_depart_lat" DOUBLE PRECISION,
    "point_depart_lng" DOUBLE PRECISION,
    "point_arrivee_lat" DOUBLE PRECISION,
    "point_arrivee_lng" DOUBLE PRECISION,
    "devoilement_depart" TIMESTAMP(3) NOT NULL,
    "devoilement_checkpoints" TIMESTAMP(3) NOT NULL,
    "devoilement_points" TIMESTAMP(3) NOT NULL,
    "gel_classement" TIMESTAMP(3) NOT NULL,
    "statut" "StatutEdition" NOT NULL DEFAULT 'BROUILLON',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Edition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL,
    "edition_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "points" INTEGER NOT NULL,
    "rayon_validation_metres" INTEGER NOT NULL DEFAULT 50,
    "type_validation" "TypeValidation" NOT NULL DEFAULT 'AUTO',
    "disparait_apres_passage" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre_affichage" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegleCheckpoint" (
    "id" TEXT NOT NULL,
    "checkpoint_id" TEXT NOT NULL,
    "type_regle" "TypeRegle" NOT NULL,
    "checkpoint_cible_id" TEXT,
    "parametres" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "RegleCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL,
    "edition_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "code_acces" TEXT NOT NULL,
    "score_total" INTEGER NOT NULL DEFAULT 0,
    "distance_vol_oiseau_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "statut" "StatutEquipe" NOT NULL DEFAULT 'INSCRITE',
    "heure_depart" TIMESTAMP(3),
    "heure_arrivee" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "equipe_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "strava_athlete_id" TEXT,
    "strava_access_token" TEXT,
    "expo_push_token" TEXT,
    "role" "RoleParticipant" NOT NULL DEFAULT 'MEMBRE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Validation" (
    "id" TEXT NOT NULL,
    "equipe_id" TEXT NOT NULL,
    "checkpoint_id" TEXT NOT NULL,
    "validated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "photo_url" TEXT,
    "statut" "StatutValidation" NOT NULL DEFAULT 'EN_ATTENTE',
    "validateur_id" TEXT,
    "points_accordes" INTEGER NOT NULL DEFAULT 0,
    "commentaire_admin" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Validation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentStrava" (
    "id" TEXT NOT NULL,
    "edition_id" TEXT NOT NULL,
    "strava_segment_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "points_premier" INTEGER NOT NULL,
    "points_second" INTEGER NOT NULL,
    "points_troisieme" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentStrava_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceStrava" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "temps_secondes" INTEGER NOT NULL,
    "classement" INTEGER NOT NULL,
    "points_gagnes" INTEGER NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceStrava_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "RoleUser" NOT NULL DEFAULT 'QG',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Checkpoint_edition_id_idx" ON "Checkpoint"("edition_id");

-- CreateIndex
CREATE INDEX "Checkpoint_edition_id_actif_idx" ON "Checkpoint"("edition_id", "actif");

-- CreateIndex
CREATE INDEX "RegleCheckpoint_checkpoint_id_idx" ON "RegleCheckpoint"("checkpoint_id");

-- CreateIndex
CREATE UNIQUE INDEX "Equipe_code_acces_key" ON "Equipe"("code_acces");

-- CreateIndex
CREATE INDEX "Equipe_edition_id_idx" ON "Equipe"("edition_id");

-- CreateIndex
CREATE INDEX "Equipe_edition_id_statut_idx" ON "Equipe"("edition_id", "statut");

-- CreateIndex
CREATE INDEX "Participant_equipe_id_idx" ON "Participant"("equipe_id");

-- CreateIndex
CREATE INDEX "Participant_strava_athlete_id_idx" ON "Participant"("strava_athlete_id");

-- CreateIndex
CREATE INDEX "Validation_equipe_id_idx" ON "Validation"("equipe_id");

-- CreateIndex
CREATE INDEX "Validation_checkpoint_id_idx" ON "Validation"("checkpoint_id");

-- CreateIndex
CREATE INDEX "Validation_equipe_id_checkpoint_id_idx" ON "Validation"("equipe_id", "checkpoint_id");

-- CreateIndex
CREATE INDEX "Validation_statut_idx" ON "Validation"("statut");

-- CreateIndex
CREATE INDEX "SegmentStrava_edition_id_idx" ON "SegmentStrava"("edition_id");

-- CreateIndex
CREATE UNIQUE INDEX "SegmentStrava_edition_id_strava_segment_id_key" ON "SegmentStrava"("edition_id", "strava_segment_id");

-- CreateIndex
CREATE INDEX "PerformanceStrava_participant_id_idx" ON "PerformanceStrava"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceStrava_participant_id_segment_id_key" ON "PerformanceStrava"("participant_id", "segment_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegleCheckpoint" ADD CONSTRAINT "RegleCheckpoint_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "Checkpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegleCheckpoint" ADD CONSTRAINT "RegleCheckpoint_checkpoint_cible_id_fkey" FOREIGN KEY ("checkpoint_cible_id") REFERENCES "Checkpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipe" ADD CONSTRAINT "Equipe_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "Equipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "Equipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "Checkpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_validateur_id_fkey" FOREIGN KEY ("validateur_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentStrava" ADD CONSTRAINT "SegmentStrava_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceStrava" ADD CONSTRAINT "PerformanceStrava_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceStrava" ADD CONSTRAINT "PerformanceStrava_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "SegmentStrava"("id") ON DELETE CASCADE ON UPDATE CASCADE;
