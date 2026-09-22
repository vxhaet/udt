import type { Checkpoint } from './api';

export const DEPART_COLOR = '#f7a51d';

export const POINTS_PALETTE = [
  '#f7a51d', '#f97316', '#e8556d', '#ec4899', '#c244a0',
  '#a855f7', '#14b8a6', '#ef4444', '#06b6d4', '#22c55e',
];

/**
 * Build a deterministic points→color mapping from NORMAL checkpoints.
 * Same input values always produce the same colors.
 */
export function buildPointsColorMap(checkpoints: Checkpoint[]): Record<string, string> {
  const distinctPoints = [...new Set(
    checkpoints
      .filter((cp) => (cp.type ?? 'NORMAL') === 'NORMAL' && cp.points != null)
      .map((cp) => cp.points!),
  )].sort((a, b) => a - b);

  const map: Record<string, string> = {};
  distinctPoints.forEach((pts, i) => {
    map[String(pts)] = POINTS_PALETTE[i % POINTS_PALETTE.length];
  });
  return map;
}
