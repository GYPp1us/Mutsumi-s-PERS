import { describe, expect, it } from "vitest";
import { buildTree, pruneEmptyGroups } from "../../store";
import type { TreeItem } from "../../store";
import type { GroupInfo, Project } from "../../tauri";
import { createEmptySnapshot } from "../state";
import type { DragSnapshot } from "../state";
import {
  buildDeterministicRows,
  computeBottomDropPreview,
  computeDeterministicDragPreview,
  resolveTargetFromDeterministicRows,
  resolveTargetFromOffsetLayout,
  resolveStableTargetFromDeterministicRows,
} from "../deterministic";
import { executeIntent, resolveIntent } from "../intent";
import { makeZoneTree } from "../snapshot";

const G1 = "g1";
const G2 = "g2";
const A = "a";
const B = "b";
const C = "c";
const D = "d";

function project(id: string, groupId: string | null): Project {
  return {
    id,
    name: id,
    path: `/${id}`,
    group_id: groupId,
    editors: [],
    starred: false,
    tags: [],
    last_opened: "",
    activity_log: [],
    sync_id: null,
  };
}

const groups: GroupInfo[] = [
  { id: G1, name: "Group 1", color: "#586878", collapsed: false },
  { id: G2, name: "Group 2", color: "#5a6a5a", collapsed: false },
];

const projects: Project[] = [
  project(A, G1),
  project(B, G1),
  project(C, G2),
  project(D, null),
];

function item(tree: TreeItem[], id: string): TreeItem {
  const found = tree.find((it) => it.id === id);
  if (!found) throw new Error(`Missing item ${id}`);
  return found;
}

function dragging(overrides: Partial<DragSnapshot>): DragSnapshot {
  return {
    ...createEmptySnapshot(),
    phase: "dragging",
    ...overrides,
  };
}

describe("deterministic drag rows", () => {
  it("keeps virtual slot coordinates stable when rows are rebuilt from preview order", () => {
    const tree = buildTree(projects, groups);
    const slot: TreeItem = { type: "group-slot", id: `slot-${G1}`, groupId: G1 };
    const previewTree = [tree[0], tree[1], tree[2], slot, ...tree.slice(3)];
    const heights = new Map(previewTree.map((it) => [it.id, it.type === "group-slot" ? 42 : 34]));

    const rows = buildDeterministicRows({
      tree: previewTree,
      measuredHeights: heights,
      containerHeight: 260,
    });

    const slotRow = rows.find((row) => row.id === `slot-${G1}`);
    expect(slotRow).toMatchObject({ top: 102, bottom: 144, kind: "group-slot" });

    const hit = resolveTargetFromDeterministicRows(rows, 120, A);
    expect(hit).toMatchObject({
      targetId: `slot-${G1}`,
      zone: "onto",
      kind: "group-slot",
    });
  });

  it("adds a bottom drop target that accepts pointer positions below rendered rows", () => {
    const tree = buildTree(projects, groups);
    const heights = new Map(tree.map((it) => [it.id, 34]));
    const rows = buildDeterministicRows({
      tree,
      measuredHeights: heights,
      containerHeight: 320,
    });

    const bottom = rows[rows.length - 1];
    expect(bottom).toMatchObject({
      id: "__bottom_drop__",
      kind: "bottom-drop",
      top: 204,
      bottom: 320,
    });

    const hit = resolveTargetFromDeterministicRows(rows, 280, A);
    expect(hit).toMatchObject({
      targetId: "__bottom_drop__",
      zone: "after",
      kind: "bottom-drop",
    });
  });

  it("subtracts non-draggable content above the first drag row before resolving targets", () => {
    const tree = buildTree(projects, groups);
    const heights = new Map(tree.map((it) => [it.id, 34]));

    const hit = resolveTargetFromOffsetLayout({
      tree,
      measuredHeights: heights,
      pointerY: 100 + 34 + 17,
      containerTop: 100,
      scrollTop: 0,
      sourceId: D,
      containerHeight: 320,
      contentOffsetTop: 34,
      previous: null,
    });

    expect(hit).toMatchObject({
      targetId: G1,
      zone: "onto",
    });

    const uncorrectedRows = buildDeterministicRows({ tree, measuredHeights: heights, containerHeight: 320 });
    expect(resolveTargetFromDeterministicRows(uncorrectedRows, 51, D)).toMatchObject({
      targetId: A,
      zone: "onto",
    });
  });

  it("moves a grouped project to the visual bottom as an ungrouped project", () => {
    const tree = buildTree(projects, groups);
    const snap = dragging({
      sourceId: A,
      sourceItem: item(tree, A),
      sourceIdx: tree.findIndex((it) => it.id === A),
      targetId: "__bottom_drop__",
      targetIdx: tree.length,
      targetItem: null,
      zone: "after",
    });

    const preview = computeBottomDropPreview(projects, groups, snap);
    const projectItems = preview.filter((it) => it.type === "project");
    expect(projectItems.map((it) => it.id)).toEqual([B, C, D, A]);
    expect(projectItems[projectItems.length - 1].project?.group_id).toBeNull();
  });

  it("moves a group header to the visual bottom as one indivisible block", () => {
    const tree = buildTree(projects, groups);
    const header = item(tree, G1);
    const snap = dragging({
      sourceId: G1,
      sourceItem: header,
      sourceIdx: tree.findIndex((it) => it.id === G1),
      targetId: "__bottom_drop__",
      targetIdx: tree.length,
      targetItem: null,
      zone: "after",
    });

    const preview = computeBottomDropPreview(projects, groups, snap);
    expect(preview.map((it) => it.id)).toEqual([G2, C, D, G1, A, B]);
  });

  it("renders a dragged group header as a collapsed visual block during preview", () => {
    const tree = buildTree(projects, groups);
    const snap = dragging({
      sourceId: G1,
      sourceItem: item(tree, G1),
      sourceIdx: tree.findIndex((it) => it.id === G1),
      targetId: D,
      targetItem: item(tree, D),
      targetIdx: tree.findIndex((it) => it.id === D),
      zone: "after",
    });

    const preview = computeDeterministicDragPreview(projects, groups, snap);
    expect(preview.map((it) => it.id)).toEqual([G2, C, D, G1]);
    expect(preview.find((it) => it.id === G1)?.groupItemCount).toBe(2);
  });

  it("uses the same collapsed source group block for group-header collision rows", () => {
    const zoneTree = makeZoneTree(projects, groups, G1);
    const rows = buildDeterministicRows({
      tree: zoneTree,
      measuredHeights: new Map([
        [G1, 34],
        [G2, 34],
        [C, 52],
        [D, 52],
      ]),
      containerHeight: 260,
    });

    expect(zoneTree.map((it) => it.id)).toEqual([G1, G2, C, D]);
    expect(rows.find((row) => row.id === G2)).toMatchObject({ top: 34, bottom: 68 });
    expect(resolveTargetFromDeterministicRows(rows, 51, G1)).toMatchObject({
      targetId: G2,
      zone: "onto",
    });
  });

  it("downgrades cross-group project onto hits to an edge insertion zone", () => {
    const tree = buildTree(projects, groups);
    const heights = new Map(tree.map((it) => [it.id, 100]));
    const targetRow = buildDeterministicRows({ tree, measuredHeights: heights })
      .find((row) => row.id === C);
    if (!targetRow) throw new Error("missing target row");

    const topHalf = resolveTargetFromOffsetLayout({
      tree,
      measuredHeights: heights,
      pointerY: targetRow.top + 45,
      containerTop: 0,
      scrollTop: 0,
      sourceId: D,
      contentOffsetTop: 0,
      previous: null,
    });
    const bottomHalf = resolveTargetFromOffsetLayout({
      tree,
      measuredHeights: heights,
      pointerY: targetRow.top + 55,
      containerTop: 0,
      scrollTop: 0,
      sourceId: D,
      contentOffsetTop: 0,
      previous: null,
    });

    expect(resolveTargetFromDeterministicRows(
      buildDeterministicRows({ tree, measuredHeights: heights }),
      targetRow.top + 45,
      D
    )?.zone).toBe("onto");
    expect(topHalf).toMatchObject({ targetId: C, zone: "before" });
    expect(bottomHalf).toMatchObject({ targetId: C, zone: "after" });
  });

  it("does not change preview layout while hovering over a collapsed group header", () => {
    const collapsedGroups = groups.map((group) =>
      group.id === G2 ? { ...group, collapsed: true } : group
    );
    const tree = buildTree(projects, collapsedGroups);
    const snap = dragging({
      sourceId: D,
      sourceItem: item(tree, D),
      sourceIdx: tree.findIndex((it) => it.id === D),
      targetId: G2,
      targetItem: item(tree, G2),
      targetIdx: tree.findIndex((it) => it.id === G2),
      zone: "onto",
      ontoGroupId: G2,
    });

    const preview = computeBottomDropPreview(projects, collapsedGroups, snap);
    expect(preview.map((it) => it.id)).toEqual([G1, A, B, G2, C, D]);
    expect(preview.find((it) => it.id === G2)?.groupCollapsed).toBe(true);
  });

  it("prunes groups that have no remaining projects", () => {
    const remainingProjects = [project(A, null), project(B, G2)];
    expect(pruneEmptyGroups(remainingProjects, groups).map((group) => group.id)).toEqual([G2]);
  });

  it("keeps an ungrouped project ungrouped when sorting after another ungrouped project below a group", async () => {
    const E = "e";
    const projectList = [...projects, project(E, null)];
    const tree = buildTree(projectList, groups);
    const snap = dragging({
      sourceId: E,
      sourceItem: item(tree, E),
      sourceIdx: tree.findIndex((it) => it.id === E),
      targetId: D,
      targetItem: item(tree, D),
      targetIdx: tree.findIndex((it) => it.id === D),
      zone: "after",
    });
    snap.intent = resolveIntent(snap);

    const preview = computeBottomDropPreview(projectList, groups, snap);
    const calls: { changes: { projectId: string; groupId: string | null }[]; order: string[] }[] = [];

    await executeIntent(snap.intent, snap, preview, projectList, groups, {
      reorderAll: (order) => calls.push({ changes: [], order }),
      batchMoveAndReorder: async (changes, order) => {
        calls.push({ changes, order });
      },
      createGroup: async () => "new-group",
      toggleGroup: async () => {},
      t: {
        groupDefaultName: (n) => `Group ${n}`,
        ungroupBadge: "Ungroup",
        joinGroupBadge: (name) => `Join ${name}`,
        newGroupBadge: "New group",
      },
    });

    expect(calls).toEqual([{ changes: [], order: [A, B, C, D, E] }]);
  });

  it("creates a group when a grouped project is dropped onto an ungrouped project", async () => {
    const tree = buildTree(projects, groups);
    const snap = dragging({
      sourceId: A,
      sourceItem: item(tree, A),
      sourceIdx: tree.findIndex((it) => it.id === A),
      targetId: D,
      targetItem: item(tree, D),
      targetIdx: tree.findIndex((it) => it.id === D),
      zone: "onto",
    });
    snap.intent = resolveIntent(snap);

    const preview = computeBottomDropPreview(projects, groups, snap);
    const calls: { changes: { projectId: string; groupId: string | null }[]; order: string[] }[] = [];
    const names: string[] = [];

    await executeIntent(snap.intent, snap, preview, projects, groups, {
      reorderAll: (order) => calls.push({ changes: [], order }),
      batchMoveAndReorder: async (changes, order) => {
        calls.push({ changes, order });
      },
      createGroup: async (name) => {
        names.push(name);
        return "new-group";
      },
      toggleGroup: async () => {},
      t: {
        groupDefaultName: (n) => `Group ${n}`,
        ungroupBadge: "Ungroup",
        joinGroupBadge: (name) => `Join ${name}`,
        newGroupBadge: "New group",
      },
    });

    expect(snap.intent).toBe("create_group");
    expect(names).toEqual(["Group 3"]);
    expect(calls).toEqual([
      {
        changes: [
          { projectId: A, groupId: "new-group" },
          { projectId: D, groupId: "new-group" },
        ],
        order: [B, C, D, A],
      },
    ]);
  });

  it("moves a grouped project into the target group when sorting on a cross-group edge", async () => {
    const tree = buildTree(projects, groups);
    const snap = dragging({
      sourceId: A,
      sourceItem: item(tree, A),
      sourceIdx: tree.findIndex((it) => it.id === A),
      targetId: C,
      targetItem: item(tree, C),
      targetIdx: tree.findIndex((it) => it.id === C),
      zone: "before",
    });
    snap.intent = resolveIntent(snap);

    const preview = computeBottomDropPreview(projects, groups, snap);
    const calls: { changes: { projectId: string; groupId: string | null }[]; order: string[] }[] = [];

    await executeIntent(snap.intent, snap, preview, projects, groups, {
      reorderAll: (order) => calls.push({ changes: [], order }),
      batchMoveAndReorder: async (changes, order) => {
        calls.push({ changes, order });
      },
      createGroup: async () => "new-group",
      toggleGroup: async () => {},
      t: {
        groupDefaultName: (n) => `Group ${n}`,
        ungroupBadge: "Ungroup",
        joinGroupBadge: (name) => `Join ${name}`,
        newGroupBadge: "New group",
      },
    });

    expect(calls).toEqual([
      {
        changes: [{ projectId: A, groupId: G2 }],
        order: [B, A, C, D],
      },
    ]);
  });

  it("uses the next unused default group name when creating a group", async () => {
    const duplicateGroups: GroupInfo[] = [
      { id: G1, name: "Group 2", color: "#586878", collapsed: false },
    ];
    const ungroupedProjects = [project(A, null), project(B, null)];
    const tree = buildTree(ungroupedProjects, duplicateGroups);
    const snap = dragging({
      sourceId: A,
      sourceItem: item(tree, A),
      sourceIdx: tree.findIndex((it) => it.id === A),
      targetId: B,
      targetItem: item(tree, B),
      targetIdx: tree.findIndex((it) => it.id === B),
      zone: "onto",
    });
    snap.intent = resolveIntent(snap);

    const preview = computeBottomDropPreview(ungroupedProjects, duplicateGroups, snap);
    const names: string[] = [];

    await executeIntent(snap.intent, snap, preview, ungroupedProjects, duplicateGroups, {
      reorderAll: () => {},
      batchMoveAndReorder: async () => {},
      createGroup: async (name) => {
        names.push(name);
        return "new-group";
      },
      toggleGroup: async () => {},
      t: {
        groupDefaultName: (n) => `Group ${n}`,
        ungroupBadge: "Ungroup",
        joinGroupBadge: (name) => `Join ${name}`,
        newGroupBadge: "New group",
      },
    });

    expect(names).toEqual(["Group 3"]);
  });

  it("keeps the previous zone inside the hysteresis band for the same target row", () => {
    const tree = buildTree(projects, groups);
    const heights = new Map(tree.map((it) => [it.id, 100]));
    const rows = buildDeterministicRows({ tree, measuredHeights: heights });
    const targetRow = rows.find((row) => row.id === B);
    if (!targetRow) throw new Error("missing target row");

    const previous = {
      targetId: B,
      targetIdx: targetRow.index,
      targetItem: targetRow.item,
      zone: "before" as const,
      kind: targetRow.kind,
    };

    const stable = resolveStableTargetFromDeterministicRows(
      rows,
      targetRow.top + 24,
      A,
      previous
    );

    expect(resolveTargetFromDeterministicRows(rows, targetRow.top + 24, A)?.zone).toBe("onto");
    expect(stable?.zone).toBe("before");
  });
});
