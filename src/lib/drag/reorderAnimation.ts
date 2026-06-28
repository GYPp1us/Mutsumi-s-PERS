export const MAX_REORDER_ANIMATION_DELTA = 320;

export function getReorderAnimationDelta(
  previousLayoutTop: number | undefined,
  nextLayoutTop: number | undefined,
  maxDelta = MAX_REORDER_ANIMATION_DELTA
): number | null {
  if (previousLayoutTop === undefined || nextLayoutTop === undefined) return null;

  const delta = previousLayoutTop - nextLayoutTop;
  if (Math.abs(delta) < 1) return null;
  if (Math.abs(delta) > maxDelta) return null;

  return delta;
}
