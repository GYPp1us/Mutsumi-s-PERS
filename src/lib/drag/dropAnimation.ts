import type { DragZone } from "./state";

export interface DropAnimationPoint {
  x: number;
  y: number;
}

export interface OverlayHighlightInput {
  sourceItemType: "project" | "group-header" | "group-slot" | null | undefined;
  targetId: string | null;
  targetItemType: "project" | "group-header" | "group-slot" | null | undefined;
  zone: DragZone;
  ontoGroupId: string | null;
}

export interface DropAnimationTargetInput {
  sourceId: string | null;
  targetId: string | null;
  previewIds: string[];
  rowTops: Map<string, number>;
  overlay: DropAnimationPoint | null;
  baseX: number;
  containerTop: number;
  contentOffsetTop: number;
  scrollTop: number;
}

export function getDropAnimationTarget(
  overlay: DropAnimationPoint | null,
  target: DropAnimationPoint | null
): DropAnimationPoint | null {
  if (!overlay || !target) return null;
  if (Math.abs(overlay.x - target.x) < 1 && Math.abs(overlay.y - target.y) < 1) return null;
  return target;
}

export function getDropAnimationTargetFromPreview({
  sourceId,
  targetId,
  previewIds,
  rowTops,
  overlay,
  baseX,
  containerTop,
  contentOffsetTop,
  scrollTop,
}: DropAnimationTargetInput): DropAnimationPoint | null {
  if (!sourceId || !targetId || !overlay) return null;
  if (!previewIds.includes(sourceId)) return null;

  const targetTop = rowTops.get(sourceId);
  if (targetTop === undefined) return null;

  return getDropAnimationTarget(overlay, {
    x: baseX,
    y: containerTop + contentOffsetTop + targetTop - scrollTop,
  });
}

export function isDropOverlayHighlighted({
  sourceItemType,
  targetId,
  targetItemType,
  zone,
  ontoGroupId,
}: OverlayHighlightInput): boolean {
  if (sourceItemType === "group-header") return false;
  if (!targetId || !targetItemType) return false;
  if (targetItemType === "group-slot") return true;
  if (ontoGroupId) return true;
  return zone === "onto";
}
