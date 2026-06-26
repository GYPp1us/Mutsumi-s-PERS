// ============================================================================
// 文件: src/lib/drag/snapshot.ts
// 作用: 拖拽开始时一次性记录所有 DOM 元素高度，拖拽过程中用纯数学推算命中目标
//
// 为什么需要这个模块?
//   当前方案在 handleDragOver 中通过两条路径获取目标元素:
//     a. dnd-kit 碰撞检测 (e.operation.target)
//     b. document.elementFromPoint 后备
//   两条路径在不同帧可能返回不一致的结果，且都依赖"DOM 已完成布局"的时机。
//
//   快照方案:
//     dragStart 时: 遍历所有 [data-dnd-item-id] 元素，记录 id → height
//     dragOver  时: 用 pointerY - containerTop + scrollTop 算出指针在内容中的偏移
//                   遍历 displayTree（预览树），累加快照高度 → 命中目标
//
//   这个计算是纯数学的，结果与"如果 DOM 已完成本次渲染"完全一致，
//   但不受 DOM 更新时机、FLIP 动画、group-slot 插入等因素影响。
// ============================================================================

import type { TreeItem } from "../store";
import type { DragZone } from "./state";
import { SWAP_THRESHOLD } from "./state";

// HeightMap: 元素 ID → 高度 (px)
// 拖拽开始时一次性建立，整个拖拽过程中不变
export type HeightMap = Map<string, number>;

// ResolvedTarget: 根据快照和预览树推算出的命中结果
export interface ResolvedTarget {
  targetId: string;
  targetIdx: number;
  zone: DragZone;
}

// ===========================================================================
// captureHeights(container) → HeightMap
//
// 遍历容器内所有带 data-dnd-item-id 属性的 DOM 元素，按实际视觉位置排序。
// 每个元素的"有效高度" = 与下一个元素的 top 间距，
// 这样 margin / gap 都自动包含在内，不会累积漂移。
// 最后一个元素：用自己的 border-box 高度。
// ===========================================================================
export function captureHeights(container: HTMLElement): HeightMap {
  const map: HeightMap = new Map();

  // 1. 收集所有元素的 id / top / height
  const entries: { id: string; top: number; height: number }[] = [];
  container.querySelectorAll<HTMLElement>("[data-dnd-item-id]").forEach((el) => {
    const id = el.getAttribute("data-dnd-item-id");
    if (id) {
      const rect = el.getBoundingClientRect();
      entries.push({ id, top: rect.top, height: rect.height });
    }
  });

  // 2. 按视觉位置排序（处理渲染顺序与 DOM 顺序一致的情况）
  entries.sort((a, b) => a.top - b.top);

  // 3. 用相邻间距作为"有效高度"（自动包含 margin）
  for (let i = 0; i < entries.length; i++) {
    const effectiveHeight = i < entries.length - 1
      ? entries[i + 1].top - entries[i].top   // 当前元素顶到下一个元素顶
      : entries[i].height;                     // 最后一个: 用自身高度
    map.set(entries[i].id, effectiveHeight);
  }

  return map;
}

// ===========================================================================
// resolveTargetFromSnapshot(
//   heights, displayTree, pointerY, containerTop, scrollTop, sourceIdx
// ) → ResolvedTarget | null
//
// 纯函数。不依赖 DOM 实时查询。
//
// 算法:
//   1. contentY = pointerY - containerTop + scrollTop
//      (将视口坐标转换为列表内容空间中的偏移量)
//
//   2. 遍历 displayTree（预览树），累加每个元素的高度:
//      - 如果 contentY 落在 [accumulated, accumulated + height) 区间内，
//        则该元素被命中
//      - 计算 zone = (contentY - elementTop) / height
//
//   3. 如果 contentY 超出所有元素 → 返回 null (指针在列表外的空白区域)
//
// 参数:
//   heights       = 拖拽开始时记录的高度快照
//   displayTree   = 当前渲染顺序的 TreeItem 列表（预览树）
//   pointerY      = dnd-kit 提供的指针视口 Y 坐标
//   containerTop  = 列表容器在拖拽开始时的 getBoundingClientRect().top
//   scrollTop     = 列表容器当前的 scrollTop
//   sourceId      = 被拖拽元素的 ID（用于自排斥，不依赖动态变化的索引）
// ===========================================================================
export function resolveTargetFromSnapshot(
  heights: HeightMap,
  displayTree: TreeItem[],
  pointerY: number,
  containerTop: number,
  scrollTop: number,
  sourceId: string  // 用 ID 而非索引，避免预览树每帧重排导致索引跳变
): ResolvedTarget | null {
  // 视口坐标 → 内容空间偏移
  const contentY = pointerY - containerTop + scrollTop;

  let accumulated = 0;

  for (let i = 0; i < displayTree.length; i++) {
    const item = displayTree[i];
    const height = heights.get(item.id) ?? 0;

    // 检查 contentY 是否落在当前元素的高度区间内
    if (contentY >= accumulated && contentY < accumulated + height) {
      // 在元素内部 → 计算相对比例 → 判定 zone
      const ratio = (contentY - accumulated) / height;

      // group-slot 总是返回 "onto"
      let zone: DragZone;
      if (item.type === "group-slot") {
        zone = "onto";
      } else if (item.id === sourceId) {
        zone = null; // 自己拖到自己（用 ID 比较，不受预览树重排影响）
      } else if (ratio < SWAP_THRESHOLD) {
        zone = "before";
      } else if (ratio > 1 - SWAP_THRESHOLD) {
        zone = "after";
      } else {
        zone = "onto";
      }

      if (zone === null) return null;
      return { targetId: item.id, targetIdx: i, zone };
    }

    accumulated += height;
  }

  // 指针在所有元素之外
  return null;
}
