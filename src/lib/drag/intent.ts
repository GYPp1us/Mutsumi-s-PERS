// ============================================================================
// 文件 6/10: src/lib/drag/intent.ts — 阅读顺序第 6 位
// 作用: 从 DragSnapshot 推导语义操作 + 执行 store 调用
//
// 两个核心函数:
//   resolveIntent(snap) → DragIntent    (纯函数, 查表即可)
//   executeIntent(...)  → Promise       (副作用: 调 store actions)
//
// 新增 TS:
//   async function → Promise-based, await 等待异步完成
//   for...of      → 遍历可迭代对象
// ============================================================================

import type { DragIntent, DragSnapshot, DragCallbacks } from "./state";
import type { TreeItem } from "../store";
import { computeFinalOrder, findEnclosingGroup, nextGroupColor } from "../store";
import type { Project, GroupInfo } from "../tauri";

// ===========================================================================
// resolveIntent(snap) → DragIntent
//
// 决策表: 输入 sourceItem.type + targetItem.type + zone → 输出 intent
//
//  | source       | target       | zone     →  intent              |
//  |--------------|--------------|----------------------------------|
//  | group-header | any          | any      →  move_group_block    |
//  | project      | group-slot   | onto     →  ungroup             |
//  | project      | project      | onto     →  join_group (有组)   |
//  |             |              |          →  create_group (无组) |
//  | project      | project      | before   →  reorder             |
//  |             |              | after    →                       |
//  | project      | group-header | onto     →  join_group          |
//  | invalid      | -            | -        →  cancel              |
// ===========================================================================
export function resolveIntent(snap: DragSnapshot): DragIntent {
  // 快速失败: 缺少必要信息 → cancel
  if (
    !snap.targetId ||
    !snap.zone ||
    !snap.sourceItem ||
    !snap.targetItem ||
    snap.sourceId === snap.targetId
  ) {
    return "cancel";
  }

  const { sourceItem, targetItem, zone } = snap;

  // 分组头 → 整组拖动（无论 zone 或 target 是什么）
  if (sourceItem.type === "group-header") {
    return "move_group_block";
  }

  // group-slot → 拖出分组
  if (targetItem.type === "group-slot") return "ungroup";

  // onto 区域:
  if (zone === "onto") {
    // 目标在分组中 → 加入该分组
    if (targetItem.project?.group_id) return "join_group";
    // 双方都无分组 → 建新组
    if (!targetItem.project?.group_id && !sourceItem.project?.group_id) {
      return "create_group";
    }
    return "join_group";
  }

  // 默认: before / after → 排序交换
  return "reorder";
}

// ===========================================================================
// executeIntent(intent, snap, previewTree, projects, groups, cbs)
//
// 根据 intent 执行对应的 store 操作。
// previewTree 是 computeDragPreview 的输出，代表"用户期望的最终状态"。
//
// 执行路径:
//   cancel            → 什么都不做
//   reorder           → 检查分组归属是否变化，调 reorderAll 或 batchMoveAndReorder
//   join_group        → 调 batchMoveAndReorder 将源加入 ontoGroupId
//   create_group      → 先 createGroup 建新组，再 batchMoveAndReorder 将双方加入
//   ungroup           → 调 batchMoveAndReorder 设置 groupId: null
//   move_group_block  → 调 reorderAll 按预览顺序重排（整组已作为一个 block 移动）
//
// 参数 cbs (DragCallbacks): 回调集合，解耦此模块与 Zustand store 的具体实现
// ===========================================================================
export async function executeIntent(
  intent: DragIntent,
  snap: DragSnapshot,
  previewTree: TreeItem[],
  projects: Project[],
  groups: GroupInfo[],
  cbs: DragCallbacks
): Promise<void> {
  const { sourceId, sourceItem, targetId, targetItem, zone } = snap;
  if (!sourceId || !targetId || !zone) return;

  // computeFinalOrder: 将预览树转回项目 ID 顺序（抛弃 group-header/slot）
  const finalOrder = computeFinalOrder(previewTree, projects);

  if (intent === "cancel") return;

  // ─── reorder: 平级排序交换 ───
  if (intent === "reorder") {
    const sp = projects.find((p) => p.id === sourceId);     // 源项目
    const newIdx = previewTree.findIndex((it) => it.id === sourceId);
    const enclosing = findEnclosingGroup(previewTree, newIdx); // 新位置所在分组

    if (sp?.group_id) {
      // 源原属某分组，但新位置在分组外 → 移出分组 + 新排序
      if (enclosing !== sp.group_id) {
        await cbs.batchMoveAndReorder(
          [{ projectId: sourceId, groupId: null }],
          finalOrder
        );
        return;
      }
    } else if (enclosing && targetItem) {
      // 源原无分组，新位置在某分组内 → 加入该分组 + 新排序
      const targetGroup = groups.find((g) => g.id === enclosing);
      if (targetGroup?.collapsed) {
        cbs.toggleGroup(enclosing, false);  // 自动展开折叠的分组
      }
      await cbs.batchMoveAndReorder(
        [{ projectId: sourceId, groupId: enclosing }],
        finalOrder
      );
      return;
    }

    // 同组内排序 或 无分组间排序 → 只重排
    cbs.reorderAll(finalOrder);
    return;
  }

  // ─── join_group: 加入已有分组 ───
  if (intent === "join_group") {
    const ontoGroup = snap.ontoGroupId;
    if (!ontoGroup) return;

    const sp = projects.find((p) => p.id === sourceId);
    // 已经在目标分组中 → 只需重排
    if (sp?.group_id === ontoGroup) {
      cbs.reorderAll(finalOrder);
      return;
    }

    // 自动展开折叠的分组
    const targetGroup = groups.find((g) => g.id === ontoGroup);
    if (targetGroup?.collapsed) {
      cbs.toggleGroup(ontoGroup, false);
    }

    await cbs.batchMoveAndReorder(
      [{ projectId: sourceId, groupId: ontoGroup }],
      finalOrder
    );
    return;
  }

  // ─── create_group: 两个无组项目建新组 ───
  if (intent === "create_group") {
    const color = nextGroupColor(groups);
    const name = cbs.t.groupDefaultName(groups.length + 1);
    // 1. 创建分组
    const ngid = await cbs.createGroup(name, color);
    // 2. 将双方加入新分组 + 排序
    await cbs.batchMoveAndReorder(
      [
        { projectId: sourceId, groupId: ngid },
        { projectId: targetId, groupId: ngid },
      ],
      finalOrder
    );
    return;
  }

  // ─── ungroup: 从分组中移除 ───
  if (intent === "ungroup") {
    await cbs.batchMoveAndReorder(
      [{ projectId: sourceId, groupId: null }],
      finalOrder
    );
    return;
  }

  // ─── move_group_block: 整组拖动 ───
  if (intent === "move_group_block") {
    if (!sourceItem || sourceItem.type !== "group-header") return;
    const gid = sourceItem.groupId;
    if (gid) {
      const targetGroup = groups.find((g) => g.id === gid);
      if (targetGroup?.collapsed) {
        cbs.toggleGroup(gid, false);
      }
    }
    // 注意: previewTree 已经包含了整组移动后的顺序
    // 分组内项目顺序不变，只需重排整体的项目 ID 顺序
    cbs.reorderAll(finalOrder);
    return;
  }
}
