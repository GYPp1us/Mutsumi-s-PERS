import type { TreeItem } from "../store";

export type DragZone = "before" | "onto" | "after" | null;

export type DragIntent =
  | "cancel"
  | "reorder"
  | "join_group"
  | "create_group"
  | "ungroup"
  | "move_group_block";

export interface DragSnapshot {
  phase: "idle" | "dragging";
  sourceId: string | null;
  sourceItem: TreeItem | null;
  sourceIdx: number;
  targetId: string | null;
  targetItem: TreeItem | null;
  targetIdx: number;
  zone: DragZone;
  ontoGroupId: string | null;
  /** Pure intent computed from zone + source + target */
  intent: DragIntent;
}

export interface DragCallbacks {
  reorderAll: (ids: string[]) => void;
  batchMoveAndReorder: (
    changes: { projectId: string; groupId: string | null }[],
    order: string[]
  ) => Promise<void>;
  createGroup: (name: string, color: string) => Promise<string>;
  toggleGroup: (id: string, collapsed: boolean) => Promise<void>;
  t: {
    groupDefaultName: (n: number) => string;
    ungroupBadge: string;
    joinGroupBadge: (name: string) => string;
    newGroupBadge: string;
  };
}

export const SWAP_THRESHOLD = 0.22;

export function createEmptySnapshot(): DragSnapshot {
  return {
    phase: "idle",
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
