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
  sourceItem?: TreeItem | null;
  contentOffsetTop: number;
  previous: DeterministicTarget | null;
}

const ZONE_HYSTERESIS = 0.06;
const ADJACENT_REORDER_RATIO = 0.25;
const ADJACENT_ONTO_RATIO = 0.5;

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
    const height = measuredHeights?.has(item.id) && measured !== undefined ? measured : estimateHeight(item);
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
  if (contentY < 0) return null;

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
  sourceItem: explicitSourceItem,
  containerHeight = 0,
  bottomDropHeight = DEFAULT_NODE_HEIGHTS.bottomDrop,
  contentOffsetTop,
  previous,
}: OffsetLayoutTargetInput): DeterministicTarget | null {
  const contentY = pointerY - containerTop + scrollTop - contentOffsetTop;
  const rows = buildDeterministicRows({ tree, measuredHeights, containerHeight, bottomDropHeight });
  const resolved = resolveStableTargetFromDeterministicRows(rows, contentY, sourceId, previous);
  if (!resolved || !resolved.targetItem) {
    return resolved;
  }

  const sourceItem = explicitSourceItem ?? tree.find((item) => item.id === sourceId) ?? null;
  if (
    sourceItem?.type === "project" &&
    resolved.targetItem.type === "project" &&
    !shouldUseEdgeInsertion(sourceItem, resolved.targetItem)
  ) {
    const row = rows[resolved.targetIdx];
    const sourceRow = rows.find((candidate) => candidate.id === sourceId);
    if (row) {
      return {
        ...resolved,
        zone: resolveDirectionalProjectZone(
          row,
          sourceRow?.index ?? -1,
          contentY,
          previous
        ),
      };
    }
  }

  if (sourceItem?.type === "group-header" && resolved.targetItem.type === "group-header") {
    return {
      ...resolved,
      zone: "before",
    };
  }
  if (sourceItem?.type === "group-header" && resolved.targetItem?.type === "project") {
    const targetGroupId = resolved.targetItem.project?.group_id ?? null;
    if (targetGroupId) {
      if (!isLastProjectInGroup(rows, resolved.targetIdx, targetGroupId)) {
        return {
          ...resolved,
          zone: "before",
        };
      }
      return {
        ...resolved,
        zone: resolveEdgeZone(rows[resolved.targetIdx], contentY, previous),
      };
    }
  }

  if (shouldUseEdgeInsertion(sourceItem, resolved.targetItem)) {
    const row = rows.find((candidate) => candidate.id === resolved.targetId);
    if (!row) return resolved;
    return {
      ...resolved,
      zone: resolveEdgeZone(row, contentY, previous),
    };
  }

  return resolved;
}

function resolveDirectionalProjectZone(
  row: DeterministicLayoutRow,
  sourceRowIndex: number,
  contentY: number,
  previous: DeterministicTarget | null
): Exclude<DragZone, null> {
  const sourceIsAboveTarget = sourceRowIndex >= 0 ? sourceRowIndex < row.index : false;
  const ratio = (contentY - row.top) / row.height;
  const zone = sourceIsAboveTarget
    ? resolveDownwardProjectZone(ratio)
    : resolveUpwardProjectZone(ratio);

  if (!previous || previous.targetId !== row.id || !previous.zone) return zone;
  if (previous.zone === zone) return zone;

  if (previous.zone === "onto" && zone !== "onto") {
    const ontoStart = sourceIsAboveTarget ? ADJACENT_REORDER_RATIO : 1 - ADJACENT_ONTO_RATIO;
    const ontoEnd = sourceIsAboveTarget ? ADJACENT_ONTO_RATIO : 1 - ADJACENT_REORDER_RATIO;
    if (ratio >= ontoStart - ZONE_HYSTERESIS && ratio <= ontoEnd + ZONE_HYSTERESIS) {
      return "onto";
    }
  }

  return zone;
}

function resolveDownwardProjectZone(ratio: number): Exclude<DragZone, null> {
  if (ratio < ADJACENT_REORDER_RATIO) return "before";
  if (ratio < ADJACENT_ONTO_RATIO) return "onto";
  return "after";
}

function resolveUpwardProjectZone(ratio: number): Exclude<DragZone, null> {
  if (ratio < 1 - ADJACENT_ONTO_RATIO) return "before";
  if (ratio < 1 - ADJACENT_REORDER_RATIO) return "onto";
  return "after";
}

function shouldUseEdgeInsertion(
  sourceItem: TreeItem | null,
  targetItem: TreeItem
): boolean {
  if (targetItem.type === "group-slot") return false;
  if (targetItem.type === "group-header") return true;
  if (sourceItem?.type === "group-header") return true;
  if (sourceItem?.type !== "project" || targetItem.type !== "project") return false;
  const targetGroupId = targetItem.project?.group_id ?? null;
  if (!targetGroupId) return false;
  const sourceGroupId = sourceItem.project?.group_id ?? null;
  return sourceGroupId !== targetGroupId;
}

function resolveEdgeZone(
  row: DeterministicLayoutRow,
  contentY: number,
  previous: DeterministicTarget | null
): Exclude<DragZone, null> {
  const ratio = (contentY - row.top) / row.height;

  if (previous?.targetId === row.id && previous.zone) {
    if (previous.zone === "before" && ratio < 0.5 + ZONE_HYSTERESIS) {
      return "before";
    }
    if (previous.zone === "after" && ratio > 0.5 - ZONE_HYSTERESIS) {
      return "after";
    }
  }

  return ratio < 0.5 ? "before" : "after";
}

function isLastProjectInGroup(
  rows: DeterministicLayoutRow[],
  targetIdx: number,
  groupId: string
): boolean {
  for (let index = targetIdx + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.kind === "group-header") break;
    if (row.item?.project?.group_id === groupId) return false;
  }
  return true;
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

  return preview
    .filter((item) => {
      if (item.type !== "project") return true;
      return item.project?.group_id !== sourceGroupId;
    })
    .map((item) => {
      if (item.type !== "group-header" || item.groupId !== sourceGroupId) return item;
      return { ...item, groupCollapsed: true };
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
