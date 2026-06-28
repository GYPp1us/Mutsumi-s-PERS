// ============================================================================
// 文件 3/10: src/lib/drag/state.ts — 阅读顺序第 3 位
// 作用: 拖拽状态机的类型定义 + 工厂函数
// 这是整个拖拽系统的"状态类型", 所有拖拽操作都用同一个 DragSnapshot 对象描述
// ============================================================================

import type { TreeItem } from "../store";

// ─── 基础类型 ───
// DragZone: 拖拽落点区域
//   "before" = 目标上方边缘 → 排序交换
//   "onto"   = 目标中间区域 → 加入分组 / 合组 / 建组
//   "after"  = 目标下方边缘 → 排序交换
//   null     = 无目标（光标在空白处）
export type DragZone = "before" | "onto" | "after" | null;

// DragIntent: 拖拽松手时的语义操作
// 每种 intent 对应一种 store 操作
export type DragIntent =
  | "cancel"            // 无效拖拽（无目标 / 原地松手）
  | "reorder"           // 平级排序：仅改变项目顺序，不改分组归属
  | "join_group"        // 加入已有分组
  | "create_group"      // 两个无分组项目建新组
  | "ungroup"           // 从分组中移除（拖入 group-slot）
  | "move_group_block"; // 整组拖动（源是 group-header）

// ─── DragSnapshot: 拖拽过程中的完整状态快照 ───
// 每次 onDragOver 触发时更新一次，是纯数据（无副作用）
export interface DragSnapshot {
  phase: "idle" | "dragging";   // 空闲 / 拖拽中
  sourceId: string | null;       // 被拖拽项的 ID
  sourceItem: TreeItem | null;   // 被拖拽项的完整数据
  sourceIdx: number;             // 源项在 displayTree 中的位置

  targetId: string | null;       // 当前悬停目标的 ID
  targetItem: TreeItem | null;   // 目标的完整数据
  targetIdx: number;             // 目标在 displayTree 中的位置

  zone: DragZone;                // 当前判定区域
  ontoGroupId: string | null;    // 如果进入分组范围，记录该分组 ID
  intent: DragIntent;            // 从 zone + source + target 推导出的语义操作
}

// ─── DragCallbacks: executeIntent 需要的 store 回调 ───
// 这里只声明"需要什么函数"，不依赖 Zustand 的具体实现
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

// ─── 常量 ───
// SWAP_THRESHOLD: edge insertion zone threshold.
// Top/bottom 30% trigger before/after; the center 40% remains onto.
export const SWAP_THRESHOLD = 0.3;

// ─── createEmptySnapshot(): 返回初始（非拖拽）状态 ───
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
