// ============================================================================
// src/lib/drag/__tests__/logic.test.ts
// 纯函数单元测试 — 无需浏览器、无需 DOM、无需 dnd-kit
// 运行: npm test
// ============================================================================

import { describe, it, expect } from "vitest";
import { createEmptySnapshot } from "../state";
import type { DragSnapshot } from "../state";
import { computeDragPreview } from "../preview";
import { resolveIntent } from "../intent";
import { deriveOntoGroupId } from "../zone";
import { resolveTargetFromSnapshot } from "../snapshot";
import type { HeightMap } from "../snapshot";
import { buildTree } from "../../store";
import type { Project, GroupInfo } from "../../tauri";
import type { TreeItem } from "../../store";

// ============================================================================
// 固定 mock 数据
// ============================================================================

const G1 = "g1";  // 分组 1
const G2 = "g2";  // 分组 2
const A = "a";    // 项目 A (在 G1)
const B = "b";    // 项目 B (在 G1)
const C = "c";    // 项目 C (在 G2)
const D = "d";    // 项目 D (无分组)

function p(id: string, groupId: string | null, name = id): Project {
  return { id, name, path: "/" + name, group_id: groupId, editors: [], starred: false, tags: [], last_opened: "", activity_log: [], sync_id: null };
}

const mockProjects: Project[] = [p(A, G1), p(B, G1), p(C, G2), p(D, null)];
const mockGroups: GroupInfo[] = [
  { id: G1, name: "Group1", color: "#586878", collapsed: false },
  { id: G2, name: "Group2", color: "#5a6a5a", collapsed: false },
];

function makeSnap(overrides: Partial<DragSnapshot> = {}): DragSnapshot {
  return { ...createEmptySnapshot(), phase: "dragging", ...overrides };
}

function ti(items: TreeItem[], id: string): number {
  return items.findIndex((it) => it.id === id);
}

// ============================================================================
// resolveIntent
// ============================================================================

describe("resolveIntent", () => {

  it("同组内 onto → reorder（不是 join_group）", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A, sourceItem: tree[ti(tree, A)],
      targetId: B, targetItem: tree[ti(tree, B)],
      zone: "onto",
    });
    expect(resolveIntent(snap)).toBe("reorder");
  });

  it("同组内 before → reorder", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A, sourceItem: tree[ti(tree, A)],
      targetId: B, targetItem: tree[ti(tree, B)],
      zone: "before",
    });
    expect(resolveIntent(snap)).toBe("reorder");
  });

  it("同组内 after → reorder", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: B, sourceItem: tree[ti(tree, B)],
      targetId: A, targetItem: tree[ti(tree, A)],
      zone: "after",
    });
    expect(resolveIntent(snap)).toBe("reorder");
  });

  it("跨组 onto → join_group", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A, sourceItem: tree[ti(tree, A)],
      targetId: C, targetItem: tree[ti(tree, C)],
      zone: "onto",
    });
    expect(resolveIntent(snap)).toBe("join_group");
  });

  it("跨组 before → reorder（边缘排序，入组在手势层处理）", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A, sourceItem: tree[ti(tree, A)],
      targetId: C, targetItem: tree[ti(tree, C)],
      zone: "before",
    });
    // before/after 统一走 reorder 路径，实际的跨组 group 分配由 executeIntent 处理
    expect(resolveIntent(snap)).toBe("reorder");
  });

  it("无分组 onto 无分组 → create_group", () => {
    const extraProj = p("e", null, "extra");
    const projects2 = [...mockProjects, extraProj];
    const tree2 = buildTree(projects2, mockGroups);
    const snap = makeSnap({
      sourceId: "e", sourceItem: tree2[ti(tree2, "e")],
      targetId: D, targetItem: tree2[ti(tree2, D)],
      zone: "onto",
    });
    expect(resolveIntent(snap)).toBe("create_group");
  });

  it("拖到 group-slot → ungroup", () => {
    // 构造一个 slot 元素
    const slotItem: TreeItem = { type: "group-slot", id: "slot-g1", groupId: G1 };
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A, sourceItem: tree[ti(tree, A)],
      targetId: "slot-g1", targetItem: slotItem,
      zone: "onto",
    });
    expect(resolveIntent(snap)).toBe("ungroup");
  });

  it("分组头拖拽 → move_group_block", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const header = tree.find((it) => it.type === "group-header");
    const snap = makeSnap({
      sourceId: header!.id, sourceItem: header!,
      targetId: D, targetItem: tree[ti(tree, D)],
      zone: "before",
    });
    expect(resolveIntent(snap)).toBe("move_group_block");
  });

  it("拖到自身 → cancel", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A, sourceItem: tree[ti(tree, A)],
      targetId: A, targetItem: tree[ti(tree, A)],
      zone: "onto",
    });
    expect(resolveIntent(snap)).toBe("cancel");
  });
});

// ============================================================================
// deriveOntoGroupId
// ============================================================================

describe("deriveOntoGroupId", () => {

  it("同组 onto → null（不显示加入提示）", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const result = deriveOntoGroupId("onto", tree[ti(tree, B)], G1);
    expect(result).toBeNull();
  });

  it("跨组 onto → 返回目标分组 ID", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const result = deriveOntoGroupId("onto", tree[ti(tree, C)], G1);
    expect(result).toBe(G2);
  });

  it("无分组 onto 无分组 → null", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const result = deriveOntoGroupId("onto", tree[ti(tree, D)], null);
    expect(result).toBeNull();
  });

  it("group-slot → null so drag-out does not highlight the source group", () => {
    const slotItem: TreeItem = { type: "group-slot", id: "slot-g1", groupId: G1 };
    const result = deriveOntoGroupId("onto", slotItem, G1);
    expect(result).toBeNull();
  });

  it("group-header after zone implies joining the group", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const header = tree.find((it) => it.type === "group-header");
    expect(deriveOntoGroupId("before", header!, null)).toBeNull();
    expect(deriveOntoGroupId("after", header!, null)).toBe(header!.groupId);
    expect(deriveOntoGroupId("onto", header!, null)).toBe(header!.groupId);
  });
});

// ============================================================================
// computeDragPreview
// ============================================================================

describe("computeDragPreview", () => {

  it("idle 状态 → 基础树（无 group-slot）", () => {
    const tree = computeDragPreview(mockProjects, mockGroups, createEmptySnapshot());
    // 确认有分组头 + 4 个项目
    const headers = tree.filter((it) => it.type === "group-header");
    expect(headers.length).toBe(2);
    const projects = tree.filter((it) => it.type === "project");
    expect(projects.length).toBe(4);
    expect(tree.every((it) => it.type !== "group-slot")).toBe(true);
  });

  it("拖拽中 → 源所在分组末尾出现 group-slot", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A, sourceItem: tree[ti(tree, A)],
    });
    const preview = computeDragPreview(mockProjects, mockGroups, snap);
    const slots = preview.filter((it) => it.type === "group-slot");
    expect(slots.length).toBe(1);
    expect(slots[0].groupId).toBe(G1);
  });

  it("keeps a single-item source group header visible with its drag-out slot", () => {
    const singleGroupProjects = [p(A, G1), p(D, null)];
    const tree = buildTree(singleGroupProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A,
      sourceItem: tree[ti(tree, A)],
      targetId: D,
      targetItem: tree[ti(tree, D)],
      zone: "after",
    });

    const preview = computeDragPreview(singleGroupProjects, mockGroups, snap);
    expect(preview.map((it) => it.id)).toEqual([G1, "slot-g1", D, A]);
  });

  it("keeps the drag-out slot visible when hovering the source group's own slot area", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A,
      sourceItem: tree[ti(tree, A)],
      targetId: "slot-g1",
      targetItem: { type: "group-slot", id: "slot-g1", groupId: G1 },
      zone: "onto",
    });

    const preview = computeDragPreview(mockProjects, mockGroups, snap);
    const slotIdx = preview.findIndex((it) => it.type === "group-slot" && it.groupId === G1);
    const bIdx = preview.findIndex((it) => it.id === B);

    expect(slotIdx).toBeGreaterThan(bIdx);
    expect(slotIdx).toBeGreaterThan(-1);
  });

  it("keeps an emptied single-item source group at its original visual position", () => {
    const singleGroupProjects = [p(D, null), p(A, G1), p("e", null)];
    const tree = buildTree(singleGroupProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A,
      sourceItem: tree[ti(tree, A)],
      targetId: "e",
      targetItem: tree[ti(tree, "e")],
      zone: "after",
    });

    const preview = computeDragPreview(singleGroupProjects, mockGroups, snap);
    expect(preview.map((it) => it.id)).toEqual([D, G1, "slot-g1", "e", A]);
  });

  it("ungroups from a single-item group at that group's visual slot position", () => {
    const singleGroupProjects = [p(D, null), p(A, G1), p("e", null)];
    const tree = buildTree(singleGroupProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A,
      sourceItem: tree[ti(tree, A)],
      targetId: "slot-g1",
      targetItem: { type: "group-slot", id: "slot-g1", groupId: G1 },
      zone: "onto",
    });

    const preview = computeDragPreview(singleGroupProjects, mockGroups, snap);
    expect(preview.filter((it) => it.type === "project").map((it) => it.id)).toEqual([D, A, "e"]);
    expect(preview.find((it) => it.id === A)?.project?.group_id).toBeNull();
  });

  it("拖拽无分组项目 → 无 group-slot 注入", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: D, sourceItem: tree[ti(tree, D)],
    });
    const preview = computeDragPreview(mockProjects, mockGroups, snap);
    expect(preview.every((it) => it.type !== "group-slot")).toBe(true);
  });

  it("同组 before 预览 → 源移到目标前，同组内", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: B, sourceItem: tree[ti(tree, B)],
      targetId: A, targetItem: tree[ti(tree, A)],
      zone: "before",
    });
    const preview = computeDragPreview(mockProjects, mockGroups, snap);
    const projIds = preview.filter((it) => it.type === "project").map((it) => it.id);
    // B 应该在 A 之前
    const bIdx = projIds.indexOf(B);
    const aIdx = projIds.indexOf(A);
    expect(bIdx).toBeLessThan(aIdx);
  });

  it("project before top group header preview moves the project above that group", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: D,
      sourceItem: tree[ti(tree, D)],
      targetId: G1,
      targetItem: tree[ti(tree, G1)],
      zone: "before",
    });

    const preview = computeDragPreview(mockProjects, mockGroups, snap);
    expect(preview.map((it) => it.id)).toEqual([D, G1, A, B, G2, C]);
  });

  it("project after a group header previews as joining that group at the top", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: D,
      sourceItem: tree[ti(tree, D)],
      targetId: G1,
      targetItem: tree[ti(tree, G1)],
      zone: "after",
    });

    const preview = computeDragPreview(mockProjects, mockGroups, snap);
    expect(preview.map((it) => it.id)).toEqual([G1, D, A, B, G2, C]);
    expect(preview.find((it) => it.id === D)?.project?.group_id).toBe(G1);
  });

  it("同组 onto 预览 → 源保持在目标的来源侧", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A, sourceItem: tree[ti(tree, A)],
      targetId: B, targetItem: tree[ti(tree, B)],
      zone: "onto",
    });
    const preview = computeDragPreview(mockProjects, mockGroups, snap);
    const projIds = preview.filter((it) => it.type === "project").map((it) => it.id);
    const aIdx = projIds.indexOf(A);
    const bIdx = projIds.indexOf(B);
    expect(aIdx).toBeLessThan(bIdx);
    // 不应排到组尾（C 在 G2，A 仍应在 G1 → B-C 之间）
    const cIdx = projIds.indexOf(C);
    expect(aIdx).toBeLessThan(cIdx);
  });

  it("keeps downward onto preview adjacent on the source side", () => {
    const ungroupedProjects = [p(A, null), p(B, null), p(C, null)];
    const tree = buildTree(ungroupedProjects, mockGroups);
    const snap = makeSnap({
      sourceId: A,
      sourceItem: tree[ti(tree, A)],
      sourceIdx: ti(tree, A),
      targetId: B,
      targetItem: tree[ti(tree, B)],
      targetIdx: ti(tree, B),
      zone: "onto",
    });

    const preview = computeDragPreview(ungroupedProjects, mockGroups, snap);
    expect(preview.map((it) => it.id)).toEqual([A, B, C]);
  });

  it("keeps upward onto preview adjacent on the source side", () => {
    const ungroupedProjects = [p(A, null), p(B, null), p(C, null)];
    const tree = buildTree(ungroupedProjects, mockGroups);
    const snap = makeSnap({
      sourceId: C,
      sourceItem: tree[ti(tree, C)],
      sourceIdx: ti(tree, C),
      targetId: B,
      targetItem: tree[ti(tree, B)],
      targetIdx: ti(tree, B),
      zone: "onto",
    });

    const preview = computeDragPreview(ungroupedProjects, mockGroups, snap);
    expect(preview.map((it) => it.id)).toEqual([A, B, C]);
  });

  it("分组头拖拽 → 整组 block 移动", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const header1 = tree.find((it) => it.type === "group-header" && it.groupId === G1)!;
    const snap = makeSnap({
      sourceId: header1.id, sourceItem: header1,
      targetId: D, targetItem: tree[ti(tree, D)],
      zone: "after",
    });
    const preview = computeDragPreview(mockProjects, mockGroups, snap);
    // G1 整组应在 D 之后
    const ids = preview.map((it) => it.id);
    const g1headerIdx = ids.indexOf(header1.id);
    const dIdx = ids.indexOf(D);
    expect(g1headerIdx).toBeGreaterThan(dIdx);
  });

  it("group-header before a grouped project previews as a collapsed block before the target group", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const header1 = tree.find((it) => it.type === "group-header" && it.groupId === G1)!;
    const snap = makeSnap({
      sourceId: header1.id,
      sourceItem: header1,
      targetId: C,
      targetItem: tree[ti(tree, C)],
      zone: "before",
    });

    const preview = computeDragPreview(mockProjects, mockGroups, snap);
    expect(preview.map((it) => it.id)).toEqual([G1, A, B, G2, C, D]);
  });
});

// ============================================================================
// resolveTargetFromSnapshot
// ============================================================================

describe("resolveTargetFromSnapshot", () => {

  // 模拟高度: 每个项目 34px (32 + 2 margin), group-header 34px, group-slot 42px
  function makeHeights(tree: TreeItem[]): HeightMap {
    const m = new Map<string, number>();
    for (const it of tree) {
      if (it.type === "group-slot") m.set(it.id, 42);
      else m.set(it.id, 34);
    }
    return m;
  }

  it("指针在第一个项目顶部 → before", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const heights = makeHeights(tree);
    const result = resolveTargetFromSnapshot(heights, tree, 100, 100, 0, "none");
    expect(result).not.toBeNull();
    // contentY = 0, ratio ≈ 0 → before
    expect(result!.zone).toBe("before");
  });

  it("指针在项目中间 → onto", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const heights = makeHeights(tree);
    // 跳过分组头(34px) → 第一个项目从 34 开始，到 68
    // contentY = 51 → 在 [34,68) 中间, ratio = (51-34)/34 ≈ 0.5
    const result = resolveTargetFromSnapshot(heights, tree, 151, 100, 0, "none");
    expect(result).not.toBeNull();
    expect(result!.zone).toBe("onto");
  });

  it("指针在自身 → null", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const heights = makeHeights(tree);
    // 第一个项目 (A) 从 34 开始, contentY = 51, sourceId = A
    const result = resolveTargetFromSnapshot(heights, tree, 151, 100, 0, A);
    // 命中自身 → null
    expect(result).toBeNull();
  });

  it("指针在所有元素之外 → null", () => {
    const tree = buildTree(mockProjects, mockGroups);
    const heights = makeHeights(tree);
    // contentY 非常大 → 超出所有元素
    const result = resolveTargetFromSnapshot(heights, tree, 2000, 100, 0, "none");
    expect(result).toBeNull();
  });

  it("group-slot → zone 总是 onto", () => {
    // 构造一个有 slot 的树
    const tree = buildTree(mockProjects, mockGroups);
    const slotItem: TreeItem = { type: "group-slot", id: "slot-g1", groupId: G1 };
    const treeWithSlot = [...tree, slotItem];
    const heights = makeHeights(treeWithSlot);
    // 指针在 slot 范围内
    const total = treeWithSlot.reduce((s, it) => s + (heights.get(it.id) ?? 0), 0);
    const result = resolveTargetFromSnapshot(heights, treeWithSlot, 100 + total - 10, 100, 0, "none");
    expect(result).not.toBeNull();
    expect(result!.zone).toBe("onto");
    expect(result!.targetId).toBe("slot-g1");
  });
});
