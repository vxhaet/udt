import { Router } from 'express';
import { prisma } from '@udt/db';
import { CreateEditionSchema, UpdateEditionSchema } from '@udt/shared';
import type { ClassementEntry } from '@udt/shared';
import { requireUser, optionalAuth } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { deactivateGel, activateGelFormat } from '../services/devoilement';
import { syncEditionStatut } from '../services/statut';
import { resetNotified } from '../jobs/devoilement';

export const editionsRouter: Router = Router();

// POST /editions
editionsRouter.post('/', requireUser('SUPER_ADMIN', 'ORGANISATEUR'), async (req, res, next) => {
  try {
    const body = CreateEditionSchema.parse(req.body);
    const edition = await prisma.edition.create({ data: body as any });
    // Calculer le statut initial
    await syncEditionStatut(edition.id, edition.date_course, edition.duree_minutes);
    const updated = await prisma.edition.findUnique({ where: { id: edition.id } });
    res.status(201).json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /editions
editionsRouter.get('/', async (_req, res, next) => {
  try {
    const editions = await prisma.edition.findMany({
      select: {
        id: true,
        nom: true,
        slug: true,
        description: true,
        reglement: true,
        nb_participants_par_equipe: true,
        solo_autorise: true,
        date_course: true,
        duree_minutes: true,
        nb_equipes_max: true,
        prix_equipe: true,
        statut: true,
        created_at: true,
        devoilement_depart: true,
        devoilement_checkpoints: true,
        devoilement_points: true,
        gel_classement: true,
        _count: { select: { equipes: true } },
      },
      orderBy: { date_course: 'desc' },
    });
    res.json(editions);
  } catch (err) {
    next(err);
  }
});

// GET /editions/by-slug/:slug — Récupère une édition par son slug (public)
editionsRouter.get('/by-slug/:slug', optionalAuth(), async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({
      where: { slug: req.params.slug },
      include: {
        _count: { select: { equipes: true } },
        formats: { select: { id: true, nom: true, duree_minutes: true } },
      },
    });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    const now = new Date();
    const isAdmin = !!req.user;
    if (!isAdmin && now < edition.devoilement_depart) {
      return res.json({
        ...edition,
        point_depart_lat: null,
        point_depart_lng: null,
        point_arrivee_lat: null,
        point_arrivee_lng: null,
      });
    }

    res.json(edition);
  } catch (err) {
    next(err);
  }
});

// GET /editions/archived — Liste des éditions archivées (public)
editionsRouter.get('/archived', async (_req, res, next) => {
  try {
    const editions = await prisma.edition.findMany({
      where: { statut: 'ARCHIVE' },
      select: {
        id: true,
        nom: true,
        description: true,
        date_course: true,
        duree_minutes: true,
        _count: { select: { equipes: true } },
      },
      orderBy: { date_course: 'desc' },
    });
    res.json(editions);
  } catch (err) {
    next(err);
  }
});

// GET /editions/:id
editionsRouter.get('/:id', optionalAuth(), async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { equipes: true, checkpoints: true } },
        config: { select: { segments_strava_actif: true } },
        formats: { select: { id: true, nom: true, duree_minutes: true, gel_actif: true } },
      },
    });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    // Masquer les coords avant dévoilement pour les non-admins
    const now = new Date();
    const isAdmin = !!req.user;
    if (!isAdmin && now < edition.devoilement_depart) {
      return res.json({
        ...edition,
        point_depart_lat: null,
        point_depart_lng: null,
        point_arrivee_lat: null,
        point_arrivee_lng: null,
      });
    }

    res.json(edition);
  } catch (err) {
    next(err);
  }
});

// PATCH /editions/:id
editionsRouter.patch('/:id', requireUser('SUPER_ADMIN', 'ORGANISATEUR'), async (req, res, next) => {
  try {
    const body = UpdateEditionSchema.parse(req.body);
    const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    const data: Record<string, unknown> = { ...body };
    const now = new Date();

    // Ignorer le statut envoyé par le client — il est calculé automatiquement
    delete data.statut;

    // Si gel_classement est repoussé dans le futur, désactiver le gel
    if (body.gel_classement) {
      const newGel = new Date(body.gel_classement);
      if (newGel > now && edition.gel_actif) {
        data.gel_actif = false;
        data.classement_gele = null;
      }
    }

    const updated = await prisma.edition.update({
      where: { id: req.params.id },
      data: data as any,
    });

    // Reset le cache de notifications pour re-evaluer les phases
    resetNotified(req.params.id);

    // Recalculer le statut à partir de date_course + duree_minutes
    const dateCourse = body.date_course ? new Date(body.date_course) : edition.date_course;
    const duree = body.duree_minutes ?? edition.duree_minutes;
    const newStatut = await syncEditionStatut(req.params.id, dateCourse, duree);

    res.json({ ...updated, statut: newStatut });
  } catch (err) {
    next(err);
  }
});

// DELETE /editions/:id
editionsRouter.delete('/:id', requireUser('SUPER_ADMIN', 'ORGANISATEUR'), async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    // Supprimer en cascade : validations, participants, equipes, checkpoints, config, formats, etc.
    await prisma.validation.deleteMany({ where: { equipe: { edition_id: req.params.id } } });
    await prisma.itineraireComplete.deleteMany({ where: { equipe: { edition_id: req.params.id } } });
    await prisma.performanceStrava.deleteMany({ where: { participant: { equipe: { edition_id: req.params.id } } } });
    await prisma.participant.deleteMany({ where: { equipe: { edition_id: req.params.id } } });
    await prisma.equipe.deleteMany({ where: { edition_id: req.params.id } });
    await prisma.regleCheckpoint.deleteMany({ where: { checkpoint: { edition_id: req.params.id } } });
    // Deconnecter les relations many-to-many checkpoint↔format avant de supprimer
    const cps = await prisma.checkpoint.findMany({ where: { edition_id: req.params.id }, select: { id: true } });
    for (const cp of cps) {
      await prisma.checkpoint.update({ where: { id: cp.id }, data: { formats: { set: [] } } });
    }
    const itins = await prisma.itineraireThematique.findMany({ where: { edition_id: req.params.id }, select: { id: true } });
    for (const it of itins) {
      await prisma.itineraireThematique.update({ where: { id: it.id }, data: { checkpoints: { set: [] } } });
    }
    await prisma.checkpoint.deleteMany({ where: { edition_id: req.params.id } });
    await prisma.segmentStrava.deleteMany({ where: { edition_id: req.params.id } });
    await prisma.itineraireThematique.deleteMany({ where: { edition_id: req.params.id } });
    await prisma.configEdition.deleteMany({ where: { edition_id: req.params.id } });
    await prisma.formatCourse.deleteMany({ where: { edition_id: req.params.id } });
    await prisma.edition.delete({ where: { id: req.params.id } });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /editions/:id/equipes — Liste des equipes (admin)
editionsRouter.get('/:id/equipes', requireUser('SUPER_ADMIN', 'ORGANISATEUR', 'QG'), async (req, res, next) => {
  try {
    const equipes = await prisma.equipe.findMany({
      where: { edition_id: req.params.id },
      include: {
        participants: { select: { id: true, nom: true, prenom: true, email: true } },
        format_course: { select: { id: true, nom: true, duree_minutes: true } },
      },
      orderBy: { created_at: 'asc' },
    });
    res.json(equipes);
  } catch (err) {
    next(err);
  }
});

// DELETE /editions/:id/equipes/:equipeId — Supprimer une equipe (admin)
editionsRouter.delete('/:id/equipes/:equipeId', requireUser('SUPER_ADMIN', 'ORGANISATEUR'), async (req, res, next) => {
  try {
    const equipe = await prisma.equipe.findUnique({ where: { id: req.params.equipeId } });
    if (!equipe || equipe.edition_id !== req.params.id) throw new AppError(404, 'Equipe introuvable');

    await prisma.validation.deleteMany({ where: { equipe_id: req.params.equipeId } });
    await prisma.itineraireComplete.deleteMany({ where: { equipe_id: req.params.equipeId } });
    await prisma.performanceStrava.deleteMany({ where: { participant: { equipe_id: req.params.equipeId } } });
    await prisma.participant.deleteMany({ where: { equipe_id: req.params.equipeId } });
    await prisma.equipe.delete({ where: { id: req.params.equipeId } });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /editions/:id/classement
editionsRouter.get('/:id/classement', optionalAuth(), async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    const isAdmin = !!req.user;

    // Load frozen format snapshots
    const frozenFormats = await prisma.formatCourse.findMany({
      where: { edition_id: req.params.id, gel_actif: true, classement_gele: { not: null } },
      select: { id: true, classement_gele: true },
    });
    const frozenByFormat = new Map(frozenFormats.map((f) => [f.id, f.classement_gele as ClassementEntry[]]));

    // Live classement
    const equipes = await prisma.equipe.findMany({
      where: {
        edition_id: req.params.id,
        statut: { notIn: ['INSCRITE', 'DISQUALIFIEE'] },
      },
      include: {
        _count: { select: { validations: { where: { statut: 'APPROUVE' } } } },
        format_course: { select: { id: true, nom: true, duree_minutes: true } },
        validations: { where: { statut: 'APPROUVE' }, orderBy: { validated_at: 'desc' }, take: 1, include: { checkpoint: { select: { nom: true } } } },
      },
      orderBy: [{ score_total: 'desc' }, { distance_vol_oiseau_km: 'desc' }, { heure_arrivee: 'asc' }],
    });

    const classement: ClassementEntry[] = equipes.map((equipe, idx) => {
      // If this team's format is frozen and we're not admin, use snapshot
      if (!isAdmin && equipe.format_course_id && frozenByFormat.has(equipe.format_course_id)) {
        const snapshot = frozenByFormat.get(equipe.format_course_id)!;
        const frozen = snapshot.find((e) => e.equipeId === equipe.id);
        if (frozen) return frozen;
      }

      return {
        rang: idx + 1,
        equipeId: equipe.id,
        nom: equipe.nom,
        scoreTotal: equipe.score_total,
        distanceVolOiseauKm: equipe.distance_vol_oiseau_km,
        nbCheckpoints: equipe._count.validations,
        heureArrivee: equipe.heure_arrivee?.toISOString() ?? null,
        statut: equipe.statut,
        format_course: equipe.format_course ?? null,
        dernier_checkpoint: equipe.validations[0]
          ? { nom: equipe.validations[0].checkpoint.nom, validated_at: equipe.validations[0].validated_at.toISOString() }
          : null,
      };
    });

    res.json(classement);
  } catch (err) {
    next(err);
  }
});

// GET /editions/:id/carte — checkpoints visibles + validations pour le live
editionsRouter.get('/:id/carte', optionalAuth(), async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    const now = new Date();
    const isAdmin = !!req.user;
    const checkpointsVisible = isAdmin || now >= edition.devoilement_checkpoints;
    const pointsVisible = isAdmin || now >= edition.devoilement_points;
    const departVisible = isAdmin || now >= edition.devoilement_depart;

    // DEPART/ARRIVEE follow departVisible ; NORMAL/EPHEMERE_QG follow checkpointsVisible
    const cpSelect = {
      id: true,
      nom: true,
      latitude: true,
      longitude: true,
      points: pointsVisible,
      rayon_validation_metres: true,
      type_validation: true,
      type: true,
      ordre_affichage: true,
      tous_formats: true,
      expires_at: true,
      formats: { select: { id: true, nom: true } },
    };

    const checkpoints = [
      ...(departVisible
        ? await prisma.checkpoint.findMany({
            where: { edition_id: req.params.id, actif: true, type: { in: ['DEPART', 'ARRIVEE'] } },
            select: cpSelect,
            orderBy: { ordre_affichage: 'asc' },
          })
        : []),
      ...(checkpointsVisible
        ? await prisma.checkpoint.findMany({
            where: {
              edition_id: req.params.id,
              actif: true,
              type: { notIn: ['DEPART', 'ARRIVEE'] },
              OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
            },
            select: cpSelect,
            orderBy: { ordre_affichage: 'asc' },
          })
        : []),
    ];

    const validations = await prisma.validation.findMany({
      where: {
        checkpoint: { edition_id: req.params.id },
        statut: 'APPROUVE',
      },
      select: {
        equipe_id: true,
        checkpoint_id: true,
        validated_at: true,
        checkpoint: { select: { latitude: true, longitude: true, nom: true, points: true, type: true } },
      },
      orderBy: { validated_at: 'asc' },
    });

    res.json({
      depart: departVisible
        ? { lat: edition.point_depart_lat, lng: edition.point_depart_lng }
        : null,
      arrivee: departVisible
        ? { lat: edition.point_arrivee_lat, lng: edition.point_arrivee_lng }
        : null,
      checkpoints,
      validations,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /editions/:id/degel — Désactive le gel et révèle les vrais scores
editionsRouter.patch('/:id/degel', requireUser('SUPER_ADMIN', 'ORGANISATEUR', 'QG'), async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
    if (!edition) throw new AppError(404, 'Édition introuvable');
    if (!edition.gel_actif) throw new AppError(400, 'Le classement n\'est pas gelé');
    await deactivateGel(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /editions/:id/archive — Passe l'édition en statut ARCHIVE
editionsRouter.post('/:id/archive', requireUser('SUPER_ADMIN', 'ORGANISATEUR'), async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
    if (!edition) throw new AppError(404, 'Édition introuvable');
    const updated = await prisma.edition.update({
      where: { id: req.params.id },
      data: { statut: 'ARCHIVE' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /editions/:id/album — Photos des validations approuvées
editionsRouter.get('/:id/album', optionalAuth(), async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    const validations = await prisma.validation.findMany({
      where: {
        checkpoint: { edition_id: req.params.id },
        statut: 'APPROUVE',
        photo_url: { not: null },
      },
      select: {
        id: true,
        photo_url: true,
        validated_at: true,
        checkpoint: { select: { nom: true } },
        equipe: { select: { nom: true } },
      },
      orderBy: { validated_at: 'asc' },
    });

    res.json(validations.map((v) => ({
      id: v.id,
      photoUrl: v.photo_url,
      checkpointNom: v.checkpoint.nom,
      equipeNom: v.equipe.nom,
      validatedAt: v.validated_at.toISOString(),
    })));
  } catch (err) {
    next(err);
  }
});

// GET /editions/:id/archive-data — Données complètes pour la page d'archive (public)
editionsRouter.get('/:id/archive-data', async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    const equipes = await prisma.equipe.findMany({
      where: { edition_id: req.params.id, statut: { notIn: ['INSCRITE', 'DISQUALIFIEE'] } },
      include: { _count: { select: { validations: { where: { statut: 'APPROUVE' } } } } },
      orderBy: [{ score_total: 'desc' }, { distance_vol_oiseau_km: 'desc' }, { heure_arrivee: 'asc' }],
    });

    const classement = equipes.map((e, idx) => ({
      rang: idx + 1,
      equipeId: e.id,
      nom: e.nom,
      scoreTotal: e.score_total,
      distanceVolOiseauKm: e.distance_vol_oiseau_km,
      nbCheckpoints: e._count.validations,
      heureArrivee: e.heure_arrivee?.toISOString() ?? null,
      statut: e.statut,
    }));

    const checkpoints = await prisma.checkpoint.findMany({
      where: { edition_id: req.params.id, type: { notIn: ['DEPART', 'ARRIVEE'] } },
      include: {
        validations: {
          where: { statut: 'APPROUVE' },
          include: { equipe: { select: { id: true, nom: true } } },
          orderBy: { validated_at: 'asc' },
        },
      },
      orderBy: { ordre_affichage: 'asc' },
    });

    const segments = await prisma.segmentStrava.findMany({
      where: { edition_id: req.params.id },
      include: {
        performances: {
          include: {
            participant: { select: { nom: true, prenom: true, equipe: { select: { nom: true } } } },
          },
          orderBy: { classement: 'asc' },
        },
      },
    });

    res.json({
      edition: {
        id: edition.id,
        nom: edition.nom,
        description: edition.description,
        date_course: edition.date_course,
        duree_minutes: edition.duree_minutes,
        statut: edition.statut,
      },
      classement,
      checkpoints: checkpoints.map((cp) => ({
        id: cp.id,
        nom: cp.nom,
        latitude: cp.latitude,
        longitude: cp.longitude,
        points: cp.points,
        type: cp.type,
        validations: cp.validations.map((v) => ({
          equipe_id: v.equipe_id,
          equipe_nom: v.equipe.nom,
          photo_url: v.photo_url,
          validated_at: v.validated_at.toISOString(),
          points_accordes: v.points_accordes,
        })),
      })),
      segments: segments.map((s) => ({
        id: s.id,
        nom: s.nom,
        strava_segment_id: s.strava_segment_id,
        points_premier: s.points_premier,
        points_second: s.points_second,
        points_troisieme: s.points_troisieme,
        performances: s.performances.map((p) => ({
          classement: p.classement,
          temps_secondes: p.temps_secondes,
          points_gagnes: p.points_gagnes,
          participant_nom: `${p.participant.prenom} ${p.participant.nom}`,
          equipe_nom: p.participant.equipe.nom,
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /editions/:id/duplicate
editionsRouter.post(
  '/:id/duplicate',
  requireUser('SUPER_ADMIN', 'ORGANISATEUR'),
  async (req, res, next) => {
    try {
      const source = await prisma.edition.findUnique({
        where: { id: req.params.id },
        include: { checkpoints: true },
      });
      if (!source) throw new AppError(404, 'Édition introuvable');

      const { id, created_at, updated_at, statut, checkpoints, classement_gele: _cg, ...editionData } = source;

      const newEdition = await prisma.edition.create({
        data: {
          ...editionData,
          nom: `${source.nom} (copie)`,
          statut: 'BROUILLON',
          gel_actif: false,
          checkpoints: {
            create: checkpoints.map(
              ({ id: _id, edition_id: _eid, created_at: _ca, updated_at: _ua, ...cp }) => cp,
            ),
          },
        },
      });

      res.status(201).json(newEdition);
    } catch (err) {
      next(err);
    }
  },
);
