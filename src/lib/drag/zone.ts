import type { DragZone, DragSnapshot } from "./state";
import { SWAP_THRESHOLD } from "./state";

export function computeZone(
  y: number,
  rect: DOMRect,
  targetIdx: number,
  sourceIdx: number
): DragZone {
  if (targetIdx === sourceIdx) return null;
  const ratio = (y - rect.top) / rect.height;
  if (ratio < SWAP_THRESHOLD) return "before";
  if (ratio > 1 - SWAP_THRESHOLD) return "after";
  return "onto";
}

export function resolveTargetFromPoint(
  x: number,
  y: number
): { id: string; element: HTMLElement } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;
  const target = el.closest("[data-dnd-item-id]") as HTMLElement | null;
  if (!target) return null;
  const id = target.getAttribute("data-dnd-item-id");
  if (!id) return null;
  return { id, element: target };
}

export function deriveOntoGroupId(
  zone: DragZone,
  targetItem: DragSnapshot["targetItem"]
): string | null {
  if (!zone || !targetItem) return null;

  if (targetItem.type === "group-slot") return targetItem.groupId || null;
  if (targetItem.type === "group-header") return targetItem.groupId || null;

  if (zone === "onto") {
    return targetItem.project?.group_id || null;
  }

  if (zone === "before" || zone === "after") {
    return targetItem.project?.group_id ?? targetItem.groupId ?? null;
  }

  return null;
}
