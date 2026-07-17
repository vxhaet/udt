import { createClient } from 'redis';

export const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });

redis.on('error', (err) => console.error('[Redis] Error:', err));
redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('reconnecting', () => console.log('[Redis] Reconnecting...'));

export async function connectRedis() {
  await redis.connect();
}

// ─────────────────────────────────────────────────────────────────────────────
// Key helpers — centralise tous les noms de clés Redis
// ─────────────────────────────────────────────────────────────────────────────

export const keys = {
  // Checkpoints bloqués pour une équipe (Set de checkpoint IDs)
  equipeBlockedCheckpoints: (equipeId: string) =>
    `udt:equipe:${equipeId}:blocked_cps`,

  // Prochain checkpoint obligatoire pour une équipe (String)
  equipeRequiredNext: (equipeId: string) =>
    `udt:equipe:${equipeId}:required_next_cp`,

  // Checkpoints "disparus" pour une édition (Set de checkpoint IDs)
  editionTakenCheckpoints: (editionId: string) =>
    `udt:edition:${editionId}:taken_cps`,

  // Flag gel classement actif pour une édition (String "1")
  gelActive: (editionId: string) =>
    `udt:edition:${editionId}:gel_active`,

  // Cache du classement sérialisé (String JSON)
  classement: (editionId: string) =>
    `udt:edition:${editionId}:classement`,
};
