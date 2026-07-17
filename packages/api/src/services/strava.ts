import axios from 'axios';
import { prisma } from '@udt/db';
import { updateTeamScore } from './scoring';

interface StravaActivitySummary {
  id: number;
  name: string;
}

interface StravaActivityDetail {
  id: number;
  name: string;
  segment_efforts: StravaSegmentEffort[];
}

interface StravaSegmentEffort {
  elapsed_time: number;
  segment: { id: number; name: string };
}

/**
 * Synchronise les performances Strava d'un athlète sur les segments
 * configurés pour son édition en cours.
 * Utilisé par le webhook Strava — activityId est fourni directement par l'événement,
 * ce qui évite de fetcher toute la liste des activités.
 */
export async function syncStravaPerformances(stravaAthleteId: number, activityId: number): Promise<void> {
  const participant = await prisma.participant.findFirst({
    where: { strava_athlete_id: String(stravaAthleteId) },
    include: {
      equipe: {
        include: {
          edition: {
            include: { segments_strava: true },
          },
        },
      },
    },
  });

  if (!participant?.strava_access_token) return;

  const segments = participant.equipe.edition.segments_strava;
  if (segments.length === 0) return;

  const segmentIdMap = new Map(segments.map((s) => [s.strava_segment_id, s]));

  try {
    console.log(`[Strava] Webhook — fetch détail activité ${activityId} pour athlète ${stravaAthleteId}`);
    const { data: detail } = await axios.get<StravaActivityDetail>(
      `https://www.strava.com/api/v3/activities/${activityId}`,
      {
        headers: { Authorization: `Bearer ${participant.strava_access_token}` },
      },
    );

    console.log(`[Strava] Activité "${detail.name}" — ${detail.segment_efforts.length} effort(s) total`);

    for (const effort of detail.segment_efforts) {
      const segment = segmentIdMap.get(String(effort.segment.id));
      if (!segment) continue;

      console.log(`[Strava]   segment "${segment.nom}" — temps: ${effort.elapsed_time}s`);

      // Comparer avec les autres performances sur ce segment pour calculer le classement
      const allPerformances = await prisma.performanceStrava.findMany({
        where: { segment_id: segment.id },
        orderBy: { temps_secondes: 'asc' },
      });

      const elapsed = effort.elapsed_time;
      const insertIdx = allPerformances.findIndex((p) => p.temps_secondes > elapsed);
      const classement = insertIdx === -1 ? allPerformances.length + 1 : insertIdx + 1;

      const points_gagnes =
        classement === 1
          ? segment.points_premier
          : classement === 2
            ? segment.points_second
            : classement === 3
              ? segment.points_troisieme
              : 0;

      console.log(`[Strava]   → classement ${classement}, points ${points_gagnes}`);

      await prisma.performanceStrava.upsert({
        where: {
          participant_id_segment_id: {
            participant_id: participant.id,
            segment_id: segment.id,
          },
        },
        create: { participant_id: participant.id, segment_id: segment.id, temps_secondes: elapsed, classement, points_gagnes },
        update: { temps_secondes: elapsed, classement, points_gagnes },
      });
    }

    await updateTeamScore(participant.equipe_id);
  } catch (err) {
    console.error(`[Strava] Sync failed for athlete ${stravaAthleteId}:`, err);
  }
}

/**
 * Synchronise toutes les performances Strava de tous les participants d'une édition.
 * 1. Récupère les activités de chaque participant avec token Strava
 * 2. Garde le meilleur temps par participant/segment
 * 3. Recalcule les classements globaux par segment
 * 4. Met à jour les scores de toutes les équipes
 */
export async function syncEditionStravaPerformances(editionId: string): Promise<void> {
  const segments = await prisma.segmentStrava.findMany({
    where: { edition_id: editionId },
  });
  if (segments.length === 0) return;

  const segmentMap = new Map(segments.map((s) => [s.strava_segment_id, s]));

  const equipes = await prisma.equipe.findMany({
    where: { edition_id: editionId },
    include: {
      participants: {
        where: { strava_access_token: { not: null } },
      },
    },
  });

  const allParticipants = equipes.flatMap((e) => e.participants);

  console.log(`[Strava] syncEdition ${editionId} — ${segments.length} segment(s), ${allParticipants.length} participant(s) avec token`);
  console.log(`[Strava] Segments cibles :`, segments.map((s) => `${s.nom} (${s.strava_segment_id})`));

  // Étape 1 : pour chaque participant, récupérer la liste des activités,
  // puis fetcher le détail de chaque activité pour obtenir les segment_efforts
  for (const participant of allParticipants) {
    console.log(`[Strava] Sync participant ${participant.id} (${participant.prenom} ${participant.nom})`);
    try {
      const { data: activities } = await axios.get<StravaActivitySummary[]>(
        'https://www.strava.com/api/v3/athlete/activities',
        {
          headers: { Authorization: `Bearer ${participant.strava_access_token}` },
          params: { per_page: 100 },
        },
      );

      console.log(`[Strava]   → ${activities.length} activité(s) trouvée(s)`);

      for (const summary of activities) {
        // GET /activities/:id retourne les segment_efforts complets
        const { data: detail } = await axios.get<StravaActivityDetail>(
          `https://www.strava.com/api/v3/activities/${summary.id}`,
          {
            headers: { Authorization: `Bearer ${participant.strava_access_token}` },
          },
        );

        const matchingEfforts = detail.segment_efforts.filter((e) =>
          segmentMap.has(String(e.segment.id)),
        );

        if (matchingEfforts.length > 0) {
          console.log(`[Strava]   → Activité "${detail.name}" (${detail.id}) : ${matchingEfforts.length} effort(s) sur nos segments`);
        }

        for (const effort of matchingEfforts) {
          const segment = segmentMap.get(String(effort.segment.id))!;
          console.log(`[Strava]     segment "${segment.nom}" — temps: ${effort.elapsed_time}s`);

          const existing = await prisma.performanceStrava.findUnique({
            where: {
              participant_id_segment_id: {
                participant_id: participant.id,
                segment_id: segment.id,
              },
            },
          });

          if (!existing || effort.elapsed_time < existing.temps_secondes) {
            console.log(`[Strava]     → upsert meilleur temps (existant: ${existing?.temps_secondes ?? 'aucun'})`);
            await prisma.performanceStrava.upsert({
              where: {
                participant_id_segment_id: {
                  participant_id: participant.id,
                  segment_id: segment.id,
                },
              },
              create: {
                participant_id: participant.id,
                segment_id: segment.id,
                temps_secondes: effort.elapsed_time,
                classement: 0,
                points_gagnes: 0,
              },
              update: {
                temps_secondes: effort.elapsed_time,
                classement: 0,
                points_gagnes: 0,
              },
            });
          } else {
            console.log(`[Strava]     → ignoré (temps existant ${existing.temps_secondes}s meilleur)`);
          }
        }
      }
    } catch (err) {
      console.error(`[Strava] Échec sync participant ${participant.id}:`, err);
    }
  }

  // Étape 2 : recalculer les classements globaux par segment
  for (const segment of segments) {
    const performances = await prisma.performanceStrava.findMany({
      where: { segment_id: segment.id },
      orderBy: { temps_secondes: 'asc' },
    });

    for (let i = 0; i < performances.length; i++) {
      const rank = i + 1;
      const points =
        rank === 1
          ? segment.points_premier
          : rank === 2
            ? segment.points_second
            : rank === 3
              ? segment.points_troisieme
              : 0;

      await prisma.performanceStrava.update({
        where: { id: performances[i].id },
        data: { classement: rank, points_gagnes: points },
      });
    }
  }

  // Étape 3 : recalculer les scores de toutes les équipes
  for (const equipe of equipes) {
    await updateTeamScore(equipe.id);
  }
}
