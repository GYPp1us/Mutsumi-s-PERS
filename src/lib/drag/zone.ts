// ============================================================================
// 文件 4/10: src/lib/drag/zone.ts — 阅读顺序第 4 位
// 作用: 拖拽区域判定 + 目标解析 + ontoGroupId 推导
// 这三个函数都是纯函数: 输入确定 → 输出确定, 无副作用, 不读写 DOM
// ============================================================================

import type { DragZone, DragSnapshot } from "./state";
import { SWAP_THRESHOLD } from "./state";

// ===========================================================================
// computeZone(y, rect, targetIdx, sourceIdx) → DragZone
//
// 根据鼠标 Y 坐标在目标元素中的相对位置判定区域:
//   ratio < 0.22        → "before"  (顶部 22%)
//   ratio > 1 - 0.22    → "after"   (底部 22%)
//   否则                → "onto"    (中间 56%)
//
// 如果目标和源是同一个元素 → 返回 null (原地松手无效)
//
// 参数:
//   y          = 鼠标在视口中的 Y 坐标 (来自 e.operation.position.y)
//   rect       = 目标元素的边界矩形 (来自 getBoundingClientRect())
//   targetIdx  = 目标在 displayTree 中的索引
//   sourceIdx  = 源在 displayTree 中的索引
// ===========================================================================
export function computeZone(
  y: number,
  rect: DOMRect,
  targetIdx: number,
  sourceIdx: number
): DragZone {
  if (targetIdx === sourceIdx) return null;        // 自己拖到自己 → 无效

  const ratio = (y - rect.top) / rect.height;      // 0~1, 鼠标在元素内的相对位置
  if (ratio < SWAP_THRESHOLD) return "before";     // 靠近顶部 → 边缘
  if (ratio > 1 - SWAP_THRESHOLD) return "after";  // 靠近底部 → 边缘
  return "onto";                                   // 中间 → 分组操作
}

// ===========================================================================
// resolveTargetFromPoint(x, y) → {id, element} | null
//
// 通过屏幕坐标反向查找 DOM 元素，用于 dnd-kit 的 sortable target 不可用时
// 作为后备方案。查找带 data-dnd-item-id 属性的最近父元素。
//
// document.elementFromPoint(x, y):  获取坐标处的顶层元素
// el.closest(selector):             向上遍历祖先树，找匹配选择器的最近元素
// ===========================================================================
export function resolveTargetFromPoint(
  x: number,
  y: number
): { id: string; element: HTMLElement } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;  // 非法坐标
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;
  const target = el.closest("[data-dnd-item-id]") as HTMLElement | null;
  if (!target) return null;
  const id = target.getAttribute("data-dnd-item-id");
  if (!id) return null;
  return { id, element: target };
}

// ===========================================================================
// deriveOntoGroupId(zone, targetItem) → groupId | null
//
// 从 zone 和目标项推导"如果松手，源将归属哪个分组"
//
// 规则:
//   target 是 group-slot     → 返回其关联的 groupId（用于 badge 显示"移出此组"）
//   target 是 group-header   → 返回该分组的 ID
//   其他目标在 group 中       → 返回目标所属分组的 ID
//   其他情况                  → null
// ===========================================================================
export function deriveOntoGroupId(
  zone: DragZone,
  targetItem: DragSnapshot["targetItem"],
  sourceGroupId: string | null  // 源的分组 ID，用于抑制同组高亮
): string | null {
  if (!zone || !targetItem) return null;

  if (targetItem.type === "group-slot") return null;
  if (targetItem.type === "group-header") return targetItem.groupId || null;

  let gid: string | null = null;
  if (zone === "onto") gid = targetItem.project?.group_id || null;
  else if (zone === "before" || zone === "after") gid = targetItem.project?.group_id ?? targetItem.groupId ?? null;

  // 源已在目标分组中 → 不显示"加入组"高亮/badge
  if (gid && sourceGroupId === gid) return null;
  return gid;
}
