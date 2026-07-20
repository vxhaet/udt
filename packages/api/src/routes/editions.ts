import { Router } from 'express';
import { prisma } from '@udt/db';
import { CreateEditionSchema, UpdateEditionSchema } from '@udt/shared';
import type { ClassementEntry } from '@udt/shared';
import { requireUser, optionalAuth } from '../middleware/auth';
import { AppError } from '../middleware/error';

export const editionsRouter: Router = Router();

// POST /editions
editionsRouter.post('/', requireUser('SUPER_ADMIN', 'ORGANISATEUR'), async (req, res, next) => {
  try {
    const body = CreateEditionSchema.parse(req.body);
    const edition = await prisma.edition.create({ data: body as any });
    res.status(201).json(edition);
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
      include: { _count: { select: { equipes: true, checkpoints: true } } },
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

    const updated = await prisma.edition.update({
      where: { id: req.params.id },
      data: body as any,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /editions/:id/classement
editionsRouter.get('/:id/classement', optionalAuth(), async (req, res, next) => {
  try {
    const edition = await prisma.edition.findUnique({ where: { id: req.params.id } });
    if (!edition) throw new AppError(404, 'Édition introuvable');

    const equipes = await prisma.equipe.findMany({
      where: {
        edition_id: req.params.id,
        statut: { notIn: ['INSCRITE', 'DISQUALIFIEE'] },
      },
      include: {
        _count: {
          select: { validations: { where: { statut: 'APPROUVE' } } },
        },
        format_course: { select: { id: true, nom: true, duree_minutes: true } },
        validations: {
          where: { statut: 'APPROUVE' },
          orderBy: { validated_at: 'desc' },
          take: 1,
          include: { checkpoint: { select: { nom: true } } },
        },
      },
      orderBy: [
        { score_total: 'desc' },
        { distance_vol_oiseau_km: 'desc' },
        { heure_arrivee: 'asc' },
      ],
    });

    const classement: ClassementEntry[] = equipes.map((equipe, idx) => ({
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
    }));

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

    const checkpoints = checkpointsVisible
      ? await prisma.checkpoint.findMany({
          where: { edition_id: req.params.id, actif: true },
          select: {
            id: true,
            nom: true,
            latitude: true,
            longitude: true,
            points: pointsVisible,
            rayon_validation_metres: true,
            type_validation: true,
            type: true,
            ordre_affichage: true,
          },
          orderBy: { ordre_affichage: 'asc' },
        })
      : [];

    const validations = await prisma.validation.findMany({
      where: {
        checkpoint: { edition_id: req.params.id },
        statut: 'APPROUVE',
      },
      select: {
        equipe_id: true,
        checkpoint_id: true,
        validated_at: true,
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

      const { id, created_at, updated_at, statut, checkpoints, ...editionData } = source;

      const newEdition = await prisma.edition.create({
        data: {
          ...editionData,
          nom: `${source.nom} (copie)`,
          statut: 'BROUILLON',
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
