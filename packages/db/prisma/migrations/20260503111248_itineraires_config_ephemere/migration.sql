-- CreateEnum
CREATE TYPE "TypeCheckpoint" AS ENUM ('NORMAL', 'EPHEMERE_QG');

-- AlterTable
ALTER TABLE "Checkpoint" ADD COLUMN     "type" "TypeCheckpoint" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "ItineraireThematique" (
    "id" TEXT NOT NULL,
    "edition_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "points_bonus" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItineraireThematique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItineraireComplete" (
    "id" TEXT NOT NULL,
    "equipe_id" TEXT NOT NULL,
    "itineraire_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "points_accordes" INTEGER NOT NULL,

    CONSTRAINT "ItineraireComplete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigEdition" (
    "id" TEXT NOT NULL,
    "edition_id" TEXT NOT NULL,
    "checkpoints_disparaissent_actif" BOOLEAN NOT NULL DEFAULT true,
    "checkpoint_suivant_impose_actif" BOOLEAN NOT NULL DEFAULT true,
    "itineraires_thematiques_actif" BOOLEAN NOT NULL DEFAULT true,
    "checkpoint_ephemere_qg_actif" BOOLEAN NOT NULL DEFAULT true,
    "segments_strava_actif" BOOLEAN NOT NULL DEFAULT true,
    "gel_classement_actif" BOOLEAN NOT NULL DEFAULT true,
    "devoilement_progressif_actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConfigEdition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ItineraireCheckpoints" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "ItineraireThematique_edition_id_idx" ON "ItineraireThematique"("edition_id");

-- CreateIndex
CREATE INDEX "ItineraireComplete_equipe_id_idx" ON "ItineraireComplete"("equipe_id");

-- CreateIndex
CREATE INDEX "ItineraireComplete_itineraire_id_idx" ON "ItineraireComplete"("itineraire_id");

-- CreateIndex
CREATE UNIQUE INDEX "ItineraireComplete_equipe_id_itineraire_id_key" ON "ItineraireComplete"("equipe_id", "itineraire_id");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigEdition_edition_id_key" ON "ConfigEdition"("edition_id");

-- CreateIndex
CREATE UNIQUE INDEX "_ItineraireCheckpoints_AB_unique" ON "_ItineraireCheckpoints"("A", "B");

-- CreateIndex
CREATE INDEX "_ItineraireCheckpoints_B_index" ON "_ItineraireCheckpoints"("B");

-- AddForeignKey
ALTER TABLE "ItineraireThematique" ADD CONSTRAINT "ItineraireThematique_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraireComplete" ADD CONSTRAINT "ItineraireComplete_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "Equipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraireComplete" ADD CONSTRAINT "ItineraireComplete_itineraire_id_fkey" FOREIGN KEY ("itineraire_id") REFERENCES "ItineraireThematique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigEdition" ADD CONSTRAINT "ConfigEdition_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItineraireCheckpoints" ADD CONSTRAINT "_ItineraireCheckpoints_A_fkey" FOREIGN KEY ("A") REFERENCES "Checkpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItineraireCheckpoints" ADD CONSTRAINT "_ItineraireCheckpoints_B_fkey" FOREIGN KEY ("B") REFERENCES "ItineraireThematique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
