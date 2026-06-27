import type { TreeItem } from "../store";
import type { Project, GroupInfo } from "../tauri";
import type { DragSnapshot, DragZone } from "./state";
import { SWAP_THRESHOLD } from "./state";
import { computeDragPreview } from "./preview";

export const BOTTOM_DROP_ID = "__bottom_drop__";

export const DEFAULT_NODE_HEIGHTS = {
  project: 52,
  groupHeader: 34,
  groupSlot: 42,
  bottomDrop: 56,
} as const;

export type DeterministicTargetKind = TreeItem["type"] | "bottom-drop";

export interface DeterministicLayoutRow {
  id: string;
  index: number;
  top: number;
  bottom: number;
  height: number;
  item: TreeItem | null;
  kind: DeterministicTargetKind;
}

export interface DeterministicTarget {
  targetId: string;
  targetIdx: number;
  targetItem: TreeItem | null;
  zone: DragZone;
  kind: DeterministicTargetKind;
}

export interface DeterministicLayoutInput {
  tree: TreeItem[];
  measuredHeights?: Map<string, number>;
  containerHeight?: number;
  bottomDropHeight?: number;
}

export interface OffsetLayoutTargetInput extends DeterministicLayoutInput {
  pointerY: number;
  containerTop: number;
  scrollTop: number;
  sourceId: string;
  contentOffsetTop: number;
  previous: DeterministicTarget | null;
}

const ZONE_HYSTERESIS = 0.06;

export function estimateHeight(item: TreeItem): number {
  if (item.type === "group-slot") return DEFAULT_NODE_HEIGHTS.groupSlot;
  if (item.type === "group-header") return DEFAULT_NODE_HEIGHTS.groupHeader;
  return DEFAULT_NODE_HEIGHTS.project;
}

export function buildDeterministicRows({
  tree,
  measuredHeights,
  containerHeight = 0,
  bottomDropHeight = DEFAULT_NODE_HEIGHTS.bottomDrop,
}: DeterministicLayoutInput): DeterministicLayoutRow[] {
  const rows: DeterministicLayoutRow[] = [];
  let top = 0;

  for (let index = 0; index < tree.length; index += 1) {
    const item = tree[index];
    const measured = measuredHeights?.get(item.id);
    const height = measured && measured > 0 ? measured : estimateHeight(item);
    rows.push({
      id: item.id,
      index,
      top,
      bottom: top + height,
      height,
      item,
      kind: item.type,
    });
    top += height;
  }

  const blankHeight = Math.max(bottomDropHeight, containerHeight - top);
  rows.push({
    id: BOTTOM_DROP_ID,
    index: tree.length,
    top,
    bottom: top + blankHeight,
    height: blankHeight,
    item: null,
    kind: "bottom-drop",
  });

  return rows;
}

export function resolveTargetFromDeterministicRows(
  rows: DeterministicLayoutRow[],
  contentY: number,
  sourceId: string
): DeterministicTarget | null {
  return resolveTargetFromRows(rows, contentY, sourceId, null);
}

export function resolveStableTargetFromDeterministicRows(
  rows: DeterministicLayoutRow[],
  contentY: number,
  sourceId: string,
  previous: DeterministicTarget | null
): DeterministicTarget | null {
  return resolveTargetFromRows(rows, contentY, sourceId, previous);
}

function resolveTargetFromRows(
  rows: DeterministicLayoutRow[],
  contentY: number,
  sourceId: string,
  previous: DeterministicTarget | null
): DeterministicTarget | null {
  for (const row of rows) {
    if (contentY < row.top || contentY >= row.bottom) continue;

    if (row.kind === "bottom-drop") {
      return {
        targetId: row.id,
        targetIdx: row.index,
        targetItem: null,
        zone: "after",
        kind: row.kind,
      };
    }

    if (row.id === sourceId) return null;

    let zone: DragZone;
    if (row.kind === "group-slot") {
      zone = "onto";
    } else {
      const ratio = (contentY - row.top) / row.height;
      zone = resolveZoneWithHysteresis(row.id, ratio, previous);
    }

    return {
      targetId: row.id,
      targetIdx: row.index,
      targetItem: row.item,
      zone,
      kind: row.kind,
    };
  }

  const bottom = rows[rows.length - 1];
  if (!bottom || bottom.kind !== "bottom-drop") return null;
  return {
    targetId: bottom.id,
    targetIdx: bottom.index,
    targetItem: null,
    zone: "after",
    kind: "bottom-drop",
  };
}

function resolveZoneWithHysteresis(
  rowId: string,
  ratio: number,
  previous: DeterministicTarget | null
): Exclude<DragZone, null> {
  if (previous?.targetId === rowId && previous.zone) {
    if (previous.zone === "before" && ratio < SWAP_THRESHOLD + ZONE_HYSTERESIS) {
      return "before";
    }
    if (previous.zone === "after" && ratio > 1 - SWAP_THRESHOLD - ZONE_HYSTERESIS) {
      return "after";
    }
    if (
      previous.zone === "onto" &&
      ratio >= SWAP_THRESHOLD - ZONE_HYSTERESIS &&
      ratio <= 1 - SWAP_THRESHOLD + ZONE_HYSTERESIS
    ) {
      return "onto";
    }
  }

  if (ratio < SWAP_THRESHOLD) return "before";
  if (ratio > 1 - SWAP_THRESHOLD) return "after";
  return "onto";
}

export function resolveTargetFromDeterministicLayout(
  tree: TreeItem[],
  measuredHeights: Map<string, number>,
  pointerY: number,
  containerTop: number,
  scrollTop: number,
  sourceId: string,
  containerHeight: number
): DeterministicTarget | null {
  const contentY = pointerY - containerTop + scrollTop;
  const rows = buildDeterministicRows({ tree, measuredHeights, containerHeight });
  return resolveTargetFromDeterministicRows(rows, contentY, sourceId);
}

export function resolveTargetFromOffsetLayout({
  tree,
  measuredHeights,
  pointerY,
  containerTop,
  scrollTop,
  sourceId,
  containerHeight = 0,
  bottomDropHeight = DEFAULT_NODE_HEIGHTS.bottomDrop,
  contentOffsetTop,
  previous,
}: OffsetLayoutTargetInput): DeterministicTarget | null {
  const contentY = pointerY - containerTop + scrollTop - contentOffsetTop;
  const rows = buildDeterministicRows({ tree, measuredHeights, containerHeight, bottomDropHeight });
  return resolveStableTargetFromDeterministicRows(rows, contentY, sourceId, previous);
}

export function computeBottomDropPreview(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  if (
    snap.phase !== "dragging" ||
    !snap.sourceId ||
    !snap.sourceItem ||
    snap.targetId !== BOTTOM_DROP_ID
  ) {
    return computeDragPreview(projects, groups, snap);
  }

  if (snap.sourceItem.type === "group-header") {
    return moveGroupBlockToBottom(projects, groups, snap.sourceItem);
  }

  const preview = projects.map((p) => ({ ...p }));
  const sourceIndex = preview.findIndex((p) => p.id === snap.sourceId);
  if (sourceIndex < 0) return computeDragPreview(projects, groups, snap);

  const [source] = preview.splice(sourceIndex, 1);
  source.group_id = null;
  preview.push(source);

  return computeDragPreview(preview, groups, {
    ...snap,
    targetId: null,
    targetItem: null,
    targetIdx: -1,
    zone: null,
  });
}

export function computeDeterministicDragPreview(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  const preview = computeBottomDropPreview(projects, groups, snap);
  if (snap.phase !== "dragging" || snap.sourceItem?.type !== "group-header") {
    return preview;
  }

  const sourceGroupId = snap.sourceItem.groupId;
  if (!sourceGroupId) return preview;

  return preview.filter((item) => {
    if (item.type !== "project") return true;
    return item.project?.group_id !== sourceGroupId;
  });
}

function moveGroupBlockToBottom(
  projects: Project[],
  groups: GroupInfo[],
  sourceItem: TreeItem
): TreeItem[] {
  const sourceGroupId = sourceItem.groupId;
  if (!sourceGroupId) return computeDragPreview(projects, groups, { ...emptyDraggingSnap(), sourceItem });

  const tree = computeDragPreview(projects, groups, emptyDraggingSnap());
  const start = tree.findIndex((it) => it.type === "group-header" && it.groupId === sourceGroupId);
  if (start < 0) return tree;

  let end = tree.length;
  for (let index = start + 1; index < tree.length; index += 1) {
    if (tree[index].type === "group-header") {
      end = index;
      break;
    }
  }

  const next = [...tree];
  const block = next.splice(start, end - start);
  next.push(...block);
  return next;
}

function emptyDraggingSnap(): DragSnapshot {
  return {
    phase: "dragging",
    sourceId: null,
    sourceItem: null,
    sourceIdx: -1,
    targetId: null,
    targetItem: null,
    targetIdx: -1,
    zone: null,
    ontoGroupId: null,
    intent: "cancel",
  };
}
