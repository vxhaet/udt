# Spec — Carte de suivi & classement enrichis (projet UDT)

Monorepo pnpm. Trois packages/apps concernés :
- `packages/api` — backend Express + Prisma (routes, services)
- `packages/db` — schéma Prisma (`prisma/schema.prisma`)
- `apps/mobile` — app Expo/React Native (`app/(app)/carte.tsx`, `app/(app)/suivi.tsx`, `app/(app)/classement.tsx`)
- `apps/admin` — back-office Next.js 14 (si le suivi/classement y est aussi consulté)

La carte utilise Leaflet via `react-native-webview` (mobile) et `leaflet` (admin). Une couche de checkpoints est injectée via `injectCheckpoints` / `window.updateCheckpoints`.

## Étape 0 — Explorer avant de coder (obligatoire)

Avant toute modification, lis et résume :
1. `apps/mobile/app/(app)/suivi.tsx` et `apps/mobile/app/(app)/carte.tsx` — comment la carte est rendue, quelle structure de données (`CarteData`) est injectée, d'où viennent `checkpoints`, `validations`, positions des équipes.
2. La route API qui alimente le suivi (chercher dans `packages/api/src/routes/` — probablement `editions.ts`, `equipes.ts`, ou une route `suivi`/`carte`). Identifier le payload exact renvoyé.
3. `apps/mobile/app/(app)/classement.tsx` + la route classement côté API (chercher `classement` dans `packages/api/src/routes/`).
4. Dans `packages/db/prisma/schema.prisma` : modèles `Equipe`, `FormatCourse`, `Validation`, `Checkpoint`, et la relation `Equipe.format_course_id`.

Ne pas supposer les noms de champs : les vérifier dans le schéma. Les scores sont dans `Equipe.score_total`. Les validations approuvées portent `statut='APPROUVE'`, `points_accordes`, `created_at`, `checkpoint_id`, `equipe_id`.

## Fonctionnalité A — Tracé du parcours de chaque équipe (carte de suivi)

Sur la carte de suivi, tracer pour chaque équipe une **polyline en pointillé** reliant, **dans l'ordre chronologique de validation**, les checkpoints qu'elle a validés (statut APPROUVE uniquement).

- Une **couleur distincte par équipe**, stable (déterministe à partir de l'id d'équipe, pas aléatoire à chaque rendu).
- Style pointillé (Leaflet `dashArray`).
- L'ordre des points = tri par `Validation.created_at` croissant.
- Le tracé part idéalement du point de départ de l'édition (`Edition.point_depart_lat/lng`) s'il existe, puis suit les checkpoints validés.
- Ne pas tracer les équipes sans validation.

Back-end : exposer, pour l'édition, la liste ordonnée des checkpoints validés par équipe (equipe_id, couleur ou juste id pour dériver la couleur côté client, et pour chaque point : lat, lng, nom, ordre/timestamp). Enrichir la route de suivi existante plutôt que d'en créer une nouvelle si possible.

## Fonctionnalité B — Filtres sur la carte de suivi

Deux filtres cumulables, en overlay sur la carte :

1. **Filtre par format** : cases à cocher listant les `FormatCourse` de l'édition. Seules les équipes dont `format_course_id` est coché sont affichées (tracé + marqueurs). Par défaut, tous cochés.
2. **Filtre par équipe** : liste des équipes (respectant le filtre format actif), permettant de n'afficher qu'une sélection. Par défaut, toutes.

Les filtres agissent sur l'affichage client (pas besoin de re-fetch si les données de toutes les équipes sont déjà chargées). Interface sobre, lisible sur mobile (~380px de large).

## Fonctionnalité C — Classement par format

Sur l'écran classement :

- Ajouter un **regroupement/onglet par format de course**. Chaque format a son propre classement (équipes de ce format triées par `score_total` décroissant).
- Conserver éventuellement un classement « général » tous formats confondus.
- Back-end : la route classement doit renvoyer le `format_course_id` (et le nom du format) de chaque équipe, pour permettre le regroupement côté client — ou renvoyer directement des classements groupés par format.

## Fonctionnalité D — Détail d'une équipe au clic (depuis le classement)

Quand on clique/tape sur le nom d'une équipe dans le classement, afficher le **détail de ses checkpoints validés** :

- Liste **dans l'ordre chronologique** (par `Validation.created_at`) des checkpoints APPROUVÉS de l'équipe.
- Pour chaque ligne : nom du checkpoint, points accordés (`points_accordes`), et **heure de validation** (`created_at`, format HH:MM local).
- Total des points en bas (doit correspondre à `score_total`).
- Back-end : une route type `GET /equipes/:id/validations` (ou enrichir l'existant) renvoyant ces validations approuvées avec checkpoint (nom, points) et created_at, triées.

## Contraintes techniques

- **Respecter le gel du classement** : la logique existante (`emitToEdition` / flag Redis `gelActive`) ne diffuse plus aux participants après gel. Les nouveaux endpoints/écrans côté participant doivent respecter ce comportement ; le back-office (admin) voit tout.
- **Ne pas casser l'authentification** : routes participant via `requireParticipant()`, routes admin via `requireUser(...)`. Vérifier quel niveau d'accès convient à chaque nouvel endpoint (le suivi/classement est-il public aux participants ou réservé admin ?). Lire l'existant pour trancher.
- **Couleurs déterministes** : dériver la couleur d'une équipe de son id (hash simple → teinte HSL), pour cohérence entre carte et classement.
- **Pas de dépendance native nouvelle** côté mobile sans raison ; réutiliser Leaflet déjà en place.
- Après modifications back-end, vérifier que l'API démarre (`pnpm --filter @udt/api dev` ou le script `dev` du package) sans erreur de type à l'exécution.
- Toute migration de schéma : privilégier `prisma db push` (le projet utilise db push, pas les migrations versionnées) — mais ici, a priori **aucun changement de schéma n'est nécessaire**, tout se lit depuis les modèles existants. Confirmer avant d'en ajouter.

## Ordre de travail suggéré

1. Étape 0 (exploration) et résumé de l'existant.
2. Fonctionnalité D (détail équipe) — la plus isolée, bon point de départ.
3. Fonctionnalité C (classement par format).
4. Fonctionnalité A (tracés carte).
5. Fonctionnalité B (filtres carte).

Tester chaque fonctionnalité avant de passer à la suivante. Ne pas tout implémenter d'un bloc.

## Base de données — CONSIGNE IMPORTANTE

**Travaille exclusivement sur la base LOCALE pour tout le développement et tous les tests.**

- Base locale : `packages/db/.env` contient `DATABASE_URL="postgresql://postgres:udt123@localhost:5432/udt"`. C'est celle-ci qu'il faut utiliser. Elle contient l'édition de test `udt-2026` (slug `udt-2026`), au statut INSCRIPTION, avec des formats de course, des checkpoints et des équipes de test.
- **Ne JAMAIS écrire sur la base de production Railway** (`sakura.proxy.rlwy.net`) pendant le développement. Ne pas exécuter de script de test, de migration ou de `db push` contre la prod. La prod ne sera mise à jour qu'à la toute fin, manuellement, une fois le code validé et committé — et pas par toi.
- Pour lancer l'API en local, utiliser le script `dev` du package `packages/api`, qui lit le `.env` local par défaut. Ne pas surcharger `DATABASE_URL` vers la prod.
- Si tu as besoin de données de test supplémentaires (équipes, validations pour voir les tracés/classements), crée-les dans la base LOCALE via un script ponctuel ou via l'API locale — jamais sur la prod.

En cas de doute sur la base ciblée, vérifier avec une requête lecture seule quelle édition existe (`udt-2026` = local ; `udt-demo` = prod) avant toute écriture.

## Déploiement (pour info — NE PAS le faire toi-même)

Le déploiement en production se fait ainsi, et c'est l'utilisateur qui le pilotera à la fin :
- push git sur `origin/main` → Railway redéploie l'API automatiquement.
- si (et seulement si) un changement de schéma a été nécessaire, appliquer `prisma db push` sur la prod manuellement.

Ton rôle s'arrête au code fonctionnel, testé en local et committé. Ne pousse pas, ne déploie pas, ne touche pas à la prod.
