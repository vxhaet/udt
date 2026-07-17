# UDT — Ultra DéTour

Course à pied par équipe de 4 participants. En un temps imparti, les équipes
partent d'un point commun, relient un maximum de checkpoints géolocalisés
(chacun valant des points), et rejoignent l'arrivée avant la fin du chrono.
Le score combine les checkpoints validés et les performances sur des segments Strava.
Chaque édition est entièrement configurable par un organisateur.

---

## Structure du monorepo

```
udt/
├── apps/
│   ├── mobile/        # React Native (Expo) — app participants
│   └── admin/         # Next.js — back-office organisateurs / QG
├── packages/
│   ├── api/           # Backend Express + Socket.io
│   ├── db/            # Schéma Prisma + client partagé
│   └── shared/        # Types TypeScript + schémas Zod communs
├── .env.example
├── package.json       # Workspace root (pnpm)
└── turbo.json
```

---

## Prérequis

- Node.js >= 18
- pnpm >= 8 (`npm install -g pnpm`)
- PostgreSQL 15+
- Redis 7+

---

## Installation

```bash
cp .env.example .env
# Renseigner DATABASE_URL, REDIS_URL, JWT_SECRET, etc.

pnpm install
pnpm db:generate   # génère le client Prisma
pnpm db:migrate    # applique les migrations (crée le schéma en base)
```

## Commandes de développement

```bash
pnpm dev               # démarre tous les packages en mode watch
pnpm api:dev           # démarre uniquement l'API

pnpm db:migrate        # nouvelle migration Prisma
pnpm db:push           # push schema sans migration (prototype)
pnpm db:studio         # Prisma Studio (UI de la base)
```

---

## Architecture de l'API (`packages/api`)

```
src/
├── index.ts           # Bootstrap : Redis → HTTP → Socket.io → Cron
├── app.ts             # Express : middlewares + montage des routes
├── config/
│   └── redis.ts       # Client Redis + helpers de clés
├── middleware/
│   ├── auth.ts        # JWT : requireUser / requireParticipant / requireAuth
│   └── error.ts       # Global error handler (ZodError + AppError + 500)
├── routes/
│   ├── auth.ts        # POST /auth/login, /auth/register, GET /auth/me
│   ├── editions.ts    # CRUD éditions, classement, carte, duplication
│   ├── checkpoints.ts # CRUD checkpoints + règles
│   ├── equipes.ts     # Création équipe, rejoindre, Stripe webhook
│   ├── validations.ts # Soumettre validation, approuver/rejeter (QG)
│   ├── messages.ts    # Broadcast QG → participants
│   └── strava.ts      # OAuth Strava + webhook
├── services/
│   ├── scoring.ts     # updateTeamScore (checkpoints + Strava)
│   ├── validation.ts  # validateCheckpointPosition (Haversine)
│   ├── rules.ts       # evaluateRules (IMPOSE_SUIVANT / EXCLUSIF_AVEC / BONUS_SI_ORDRE)
│   ├── devoilement.ts # processPhase* / activateGel
│   └── strava.ts      # syncStravaPerformances
├── ws/
│   └── index.ts       # Socket.io : rooms admin / participant / equipe
└── jobs/
    └── devoilement.ts # Cron toutes les minutes → checkDevoilements
```

---

## Authentification JWT

Deux types de tokens sont émis :

| Type          | Payload                                              | Émis par                        |
|---------------|------------------------------------------------------|---------------------------------|
| `user`        | `{ type, userId, role }`                             | `POST /auth/login`              |
| `participant` | `{ type, participantId, equipeId, editionId }`       | `POST /equipes` / `POST /equipes/join` |

Rôles utilisateurs : `SUPER_ADMIN > ORGANISATEUR > QG`

---

## WebSocket (Socket.io)

Connexion : `{ auth: { token: "<JWT>" } }`

Événement client → serveur :
- `join:edition(editionId)` — s'abonner à une édition

Rooms côté serveur :
- `admin:{editionId}` — admins (reçoivent tout, même pendant le gel)
- `participant:{editionId}` — participants (bloqués pendant le gel)
- `equipe:{equipeId}` — notifications spécifiques à une équipe
- `edition:{editionId}` — broadcast total

Événements serveur → client :

| Événement             | Émetteur                   | Gel respecté |
|-----------------------|----------------------------|--------------|
| `validation:approved` | Après validation réussie   | Oui          |
| `validation:pending`  | Validation MANUELLE reçue  | Non (admins) |
| `validation:rejected` | Rejet par admin            | Non          |
| `score:update`        | Recalcul du score          | Oui          |
| `checkpoint:revealed` | Cron dévoilement           | Non          |
| `checkpoint:taken`    | disparait_apres_passage    | Non          |
| `message:qg`          | Broadcast QG               | Non          |

---

## Règles métier clés

### Dévoilement progressif

| Timestamp                 | Ce qui est révélé                       |
|---------------------------|-----------------------------------------|
| `devoilement_depart`      | Coordonnées de départ et d'arrivée      |
| `devoilement_checkpoints` | Liste des checkpoints (sans les points) |
| `devoilement_points`      | Points de chaque checkpoint             |

Implémenté par un cron (1 min) dans `jobs/devoilement.ts`.
Les données sont toujours en base ; c'est la couche API qui filtre
selon le timestamp et le rôle du demandeur.

### Moteur de validation

1. App mobile → `POST /validations` avec position GPS (+ photo optionnelle)
2. Backend vérifie : équipe EN_COURSE, checkpoint actif, pas bloqué, pas déjà approuvé, dans le rayon
3. `type_validation = AUTO` → approuvé immédiatement
4. `type_validation = MANUELLE | MIXTE` → statut EN_ATTENTE, notification Socket.io aux admins
5. Approbation admin → `PATCH /validations/:id`
6. Post-validation : `evaluateRules` → `updateTeamScore` → diffusion WebSocket

### Moteur de règles

| TypeRegle        | Comportement                                                         | Stockage        |
|------------------|----------------------------------------------------------------------|-----------------|
| `IMPOSE_SUIVANT` | Le prochain CP de l'équipe doit être `checkpoint_cible_id`           | Redis (string)  |
| `EXCLUSIF_AVEC`  | Valider ce CP bloque `checkpoint_cible_id` pour cette équipe         | Redis (set)     |
| `BONUS_SI_ORDRE` | Points bonus si ce CP est le N-ième validé (`parametres.ordre/bonus`)| DB update       |

`disparait_apres_passage = true` → le CP passe `actif = false` en base dès la 1ère validation.

### Scoring

```
score_total = Σ(validation.points_accordes WHERE statut = APPROUVE)
            + Σ(performance_strava.points_gagnes)

distance_vol_oiseau_km = Σ haversine(CP[i-1], CP[i])
  pour i in validations triées par validated_at
```

### Gel du classement (`gel_classement`)

- Un flag Redis `udt:edition:{id}:gel_active` est activé
- `emitToEdition()` n'émet plus vers la room `participant:{id}`
- Les admins/QG continuent de recevoir toutes les mises à jour

---

## Variables d'environnement

Voir `.env.example` pour la liste complète.
Variables critiques : `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`,
`STRIPE_SECRET_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.

---

## Migrations Prisma

```bash
# Créer une migration après modification du schéma
cd packages/db
pnpm exec prisma migrate dev --name <description>

# En production
pnpm exec prisma migrate deploy
```

---

## Points d'API

| Méthode | Route                              | Auth requise              |
|---------|------------------------------------|---------------------------|
| POST    | /auth/login                        | —                         |
| POST    | /auth/register                     | SUPER_ADMIN               |
| GET     | /auth/me                           | user                      |
| POST    | /editions                          | SUPER_ADMIN, ORGANISATEUR |
| GET     | /editions                          | —                         |
| GET     | /editions/:id                      | —                         |
| PATCH   | /editions/:id                      | SUPER_ADMIN, ORGANISATEUR |
| GET     | /editions/:id/classement           | —                         |
| GET     | /editions/:id/carte                | —                         |
| POST    | /editions/:id/duplicate            | SUPER_ADMIN, ORGANISATEUR |
| GET     | /editions/:id/checkpoints          | —                         |
| POST    | /editions/:id/checkpoints          | SUPER_ADMIN, ORGANISATEUR |
| PATCH   | /editions/:id/checkpoints/:cpId    | SUPER_ADMIN, ORGANISATEUR |
| POST    | /editions/:id/checkpoints/:cpId/regles | SUPER_ADMIN, ORGANISATEUR |
| POST    | /editions/:id/messages             | SUPER_ADMIN, ORGANISATEUR, QG |
| POST    | /equipes                           | —                         |
| POST    | /equipes/join                      | —                         |
| GET     | /equipes/:id                       | participant               |
| PATCH   | /equipes/:id/push-token            | participant               |
| POST    | /equipes/stripe/webhook            | (Stripe signature)        |
| POST    | /validations                       | participant               |
| PATCH   | /validations/:id                   | SUPER_ADMIN, ORGANISATEUR, QG |
| GET     | /validations/pending               | SUPER_ADMIN, ORGANISATEUR, QG |
| GET     | /strava/auth                       | participant               |
| GET     | /strava/callback                   | —                         |
| GET     | /strava/webhook                    | (Strava verify)           |
| POST    | /strava/webhook                    | (Strava signature)        |
| WS      | /                                  | JWT dans handshake.auth   |

---

## Prochaines étapes

- [ ] `apps/admin` — dashboard Next.js (liste éditions, QG live, gestion validations)
- [ ] `apps/mobile` — app Expo (carte live, validation checkpoint, classement)
- [ ] Tests unitaires sur les services métier (scoring, rules, validation)
- [ ] Endpoint replay post-course (`GET /editions/:id/replay`)
- [ ] Gestion des refresh tokens Strava (expiration 6h)
- [ ] Pagination sur les endpoints de liste
- [ ] Rate limiting spécifique sur `POST /validations`
