import type { Checkpoint } from './api';

export const DEPART_COLOR = '#10b981';

export const POINTS_PALETTE = [
  '#22c55e', '#eab308', '#3b82f6', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#a3e635',
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
