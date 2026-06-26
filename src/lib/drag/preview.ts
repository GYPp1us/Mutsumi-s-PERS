// ============================================================================
// 文件 5/10: src/lib/drag/preview.ts — 阅读顺序第 5 位
// 作用: 预览树计算（拖拽系统的核心算法）
//
// computeDragPreview(projects, groups, snap) → TreeItem[]
//   输入: 当前项目列表 + 分组列表 + 拖拽状态快照
//   输出: 应该在侧边栏中渲染的 TreeItem 列表（反映"如果现在松手"的效果）
//
// 这是整个拖拽系统的核心: 将用户的拖拽意图转化为视觉预览。
// 所有变更都在临时副本上进行，不影响原始数据。
//
// 调用时机: 每次 onDragOver 触发后，React 用此函数的返回值渲染侧边栏
//
// 新增 TS 语法:
//   findIndex(fn):  数组方法，返回第一个满足 fn 的元素的索引，找不到返回 -1
//   splice(pos, n): 从 pos 位置删除 n 个元素（就地修改），返回被删除的元素
//   splice(pos, 0, item): 在 pos 位置插入 item（不删除）
//   map(fn):        数组方法，返回一个新数组，每个元素经过 fn 变换
//   for...of:       遍历可迭代对象（类似 Python for item in iterable）
//   const [x] = arr: 解构赋值，取数组第一个元素（类似 Python x, *_ = arr）
// ============================================================================

import type { Project, GroupInfo } from "../tauri";
import type { TreeItem } from "../store";
import { buildTree } from "../store";
import type { DragSnapshot } from "./state";

// ===========================================================================
// computeDragPreview: 入口函数
//
// 决策树:
//   1. 没在拖拽 / 没源 / 没目标 / 没区域 → 返回基础树（无预览变动）
//   2. 源是 group-header                → previewGroupHeader (整组拖动)
//   3. 目标是 group-slot                → previewUngroup (拖出分组)
//   4. 其他                             → previewProject (项目级拖拽)
//
// 所有返回值都经过 injectSourceSlot 注入"拖出此组"幽灵条目
// ===========================================================================
export function computeDragPreview(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  // 条件 1: 非拖拽状态 或 缺少必要字段 → 返回不变的基础树
  if (snap.phase === "idle" || !snap.sourceId || !snap.sourceItem) {
    return baseTree(projects, groups, snap);
  }

  // 条件: 缺少目标/区域 → 基础树（但含 group-slot）
  if (!snap.targetId || !snap.zone || !snap.targetItem) {
    return baseTree(projects, groups, snap);
  }

  // 条件: 拖到自己 → 无变化
  if (snap.sourceId === snap.targetId) return baseTree(projects, groups, snap);

  // 条件 2: 源是分组头 → 整组拖动
  if (snap.sourceItem.type === "group-header") {
    return previewGroupHeader(projects, groups, snap);
  }

  // 条件 3: 目标是 group-slot → 拖出分组
  if (snap.targetItem.type === "group-slot") {
    return previewUngroup(projects, groups, snap);
  }

  // 条件 4: 默认 → 项目级拖拽（排序 / 入组 / 建组）
  return previewProject(projects, groups, snap);
}

// ===========================================================================
// baseTree: 返回基础树 + 可选的 group-slot 注入
// 不预览任何位置变化，仅确保"拖出此组"幽灵条目存在
// ===========================================================================
function baseTree(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  const tree = buildTree(projects, groups);
  return injectSourceSlot(tree, projects, groups, snap);
}

// ===========================================================================
// injectSourceSlot: 在源项所在分组的末尾注入 group-slot
//
// 条件:
//   1. 源是 project（不是 group-header）
//   2. 源属于某个分组
//   3. 该分组未折叠
//
// 效果: 在分组内最后一个项目之后插入:
//   { type: "group-slot", id: "slot-{groupId}", groupId }
//
// 这个 slot 是"拖出此组"的视觉入口，拖入此 slot 松手 → ungroup
// ===========================================================================
function injectSourceSlot(
  tree: TreeItem[],
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  if (snap.sourceItem?.type !== "project") return tree;          // 只对项目生效
  const sourceProject = projects.find((p) => p.id === snap.sourceId);
  if (!sourceProject?.group_id) return tree;                    // 无分组 → 不注入

  const g = groups.find((grp) => grp.id === sourceProject.group_id);
  if (!g || g.collapsed) return tree;                           // 分组不存在或已折叠

  const result = [...tree];  // 浅拷贝，不修改原数组
  let lastIdx = -1;

  // 找到该分组在树中的最后一个项目
  for (let i = 0; i < result.length; i++) {
    if (result[i].project?.group_id === sourceProject.group_id) {
      lastIdx = i;
    }
  }

  // 在该项目之后插入 slot
  if (lastIdx >= 0) {
    result.splice(lastIdx + 1, 0, {
      type: "group-slot",
      id: `slot-${sourceProject.group_id}`,
      groupId: sourceProject.group_id,
    });
  }
  return result;
}

// ===========================================================================
// previewProject: 项目拖拽的预览逻辑
//
// 核心思路: 在 projects 副本上修改顺序和 group_id，然后 buildTree 回 TreeItem[]
//
// 三种 zone 的区别:
//   "before"  → 源插入到目标前，继承目标的 group_id
//   "after"   → 源插入到目标后，继承目标的 group_id
//   "onto"    → 复杂:
//       目标在组内 → 源加入该组，排在组内最后
//       目标无分组 → 源插入目标后（两个无组项高亮，松手时建新组）
//
// 注意: 这里修改 group_id 只是预览用的临时赋值，真正修改在松手时 executeIntent 中
// ===========================================================================
function previewProject(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  const sourceItem = snap.sourceItem!;    // ! 非空断言: 调用者已确保非空
  const targetItem = snap.targetItem!;
  const { zone } = snap;

  // 克隆 projects 数组（浅拷贝每个 Project 对象），避免修改原始数据
  const preview = projects.map((p) => ({ ...p }));

  // 找到源和目标在克隆数组中的位置
  const si = preview.findIndex((p) => p.id === sourceItem.id);
  const ti = preview.findIndex((p) => p.id === targetItem.id);
  if (si === -1 || ti === -1) return buildTree(projects, groups);

  const targetProject = preview[ti];
  let newGroupId: string | null = null;   // 源在预览中的临时 group_id
  let insertAt: number;                   // 源应该插入的位置

  // ─── 根据 zone 确定 newGroupId 和 insertAt ───
  if (zone === "before") {
    // 插到目标前，继承目标的 group_id
    insertAt = ti;
    newGroupId = targetProject.group_id;
  } else if (zone === "after") {
    // 插到目标后，继承目标的 group_id
    insertAt = ti + 1;
    newGroupId = targetProject.group_id;
  } else {
    // zone === "onto"
    if (targetProject.group_id) {
      newGroupId = targetProject.group_id;
      // 同组内 onto → 插到目标后即可，不扩展至组尾
      if (preview[si].group_id === targetProject.group_id) {
        insertAt = ti + 1;
      } else {
        // 跨组 onto → 源加入该组，排到组尾
        insertAt = ti + 1;
        const gid = newGroupId;
        for (let i = ti + 1; i < preview.length; i++) {
          if (preview[i].group_id === gid) insertAt = i + 1;
          else break;
        }
      }
    } else {
      // 目标无分组 → 源插入目标后，group_id 不变（松手时建新组）
      insertAt = ti + 1;
      // newGroupId 保持 null
    }
  }

  // ─── 执行移动 ───
  const [src] = preview.splice(si, 1);   // 从原位置取出源
  src.group_id = newGroupId;             // 临时给源赋新 group_id（仅预览）

  // 考虑到取出源后数组变短，调整插入位置
  const adjustedAt = si < insertAt ? insertAt - 1 : insertAt;
  preview.splice(adjustedAt, 0, src);    // 在新位置插入源

  // 从修改后的 projects 副本构建树，再注入 group-slot
  const tree = buildTree(preview, groups);
  return injectSourceSlot(tree, projects, groups, snap);
}

// ===========================================================================
// previewUngroup: 拖入 group-slot 的预览
//
// 效果: 源从分组中移出 (group_id → null)，移到 slot 所在位置之后
// ===========================================================================
function previewUngroup(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  const sourceItem = snap.sourceItem!;
  const sourceId = sourceItem.id;

  const preview = projects.map((p) => ({ ...p }));
  const si = preview.findIndex((p) => p.id === sourceId);
  if (si === -1) return buildTree(projects, groups);

  const [src] = preview.splice(si, 1);
  src.group_id = null;   // 移出分组

  // 找到 slot 对应的分组中最后一个项目的位置，插入其后
  const slotGroupId = snap.targetItem?.groupId;
  if (slotGroupId) {
    let insertAt = 0;
    for (let i = preview.length - 1; i >= 0; i--) {
      if (preview[i].group_id === slotGroupId) {
        insertAt = i + 1;
        break;
      }
    }
    preview.splice(insertAt, 0, src);
  } else {
    preview.push(src);   // 防御: 找不到 slot 分组 → 放末尾
  }

  return buildTree(preview, groups);
  // 注意: ungroup 后源不在分组中，无需注入 group-slot
}

// ===========================================================================
// previewGroupHeader: 整组拖动的预览
//
// 不修改 projects 数组，直接在 TreeItem 层面操作:
//   1. 从基础树中找到源分组头及其所有组内项目 → 组成 block
//   2. 将 block 从树中移除
//   3. 在目标位置插入 block
//
// 注意: zone === "onto" 在此函数中已被降级为 "before"
//       (分组头拖到另一分组头中间 → 整组排到目标组前)
// ===========================================================================
function previewGroupHeader(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  const sourceItem = snap.sourceItem!;
  const targetItem = snap.targetItem!;
  const { zone } = snap;

  const sourceGroupId = sourceItem.groupId;
  if (!sourceGroupId) return buildTree(projects, groups);

  const tree = buildTree(projects, groups);

  // ─── 1. 找到源分组的 block 范围 ───
  const headerIdx = tree.findIndex((it) => it.id === sourceItem.id);
  if (headerIdx === -1) return tree;

  // blockEnd = 下一个 group-header 的位置，或 tree.length
  let blockEnd = tree.length;
  for (let i = headerIdx + 1; i < tree.length; i++) {
    if (tree[i].type === "group-header") {
      blockEnd = i;
      break;
    }
  }

  // 提取 block = [group-header, project, project, ...]
  const block = tree.slice(headerIdx, blockEnd);
  // 树被切成 before + after（不含源 block）
  const before = tree.slice(0, headerIdx);
  const after = tree.slice(blockEnd);

  // ─── 2. 在 before 或 after 中找目标位置 ───
  const targetInBefore = before.findIndex((it) => it.id === targetItem.id);
  const targetInAfter = after.findIndex((it) => it.id === targetItem.id);

  // ─── 3. 插入 block ───
  if (targetInBefore >= 0) {
    // 目标在 before 段中
    // zone === "after" → 插入到目标之后（index + 1）
    const pos = zone === "after" ? targetInBefore + 1 : targetInBefore;
    before.splice(pos, 0, ...block);       // ...block 展开为多个参数
    return [...before, ...after];
  }

  if (targetInAfter >= 0) {
    const pos = zone === "after" ? targetInAfter + 1 : targetInAfter;
    after.splice(pos, 0, ...block);
    return [...before, ...after];
  }

  // 防御: 目标未找到 → block 放回原位
  return [...before, ...block, ...after];
}
