import type { Project, GroupInfo } from "../tauri";
import type { TreeItem } from "../store";
import { buildTree } from "../store";
import type { DragSnapshot } from "./state";

export function computeDragPreview(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  if (snap.phase === "idle" || !snap.sourceId || !snap.sourceItem) {
    return baseTree(projects, groups, snap);
  }

  if (!snap.targetId || !snap.zone || !snap.targetItem) {
    return baseTree(projects, groups, snap);
  }

  if (snap.sourceId === snap.targetId) return baseTree(projects, groups, snap);

  if (snap.sourceItem.type === "group-header") {
    return previewGroupHeader(projects, groups, snap);
  }

  if (snap.targetItem.type === "group-slot") {
    return previewUngroup(projects, groups, snap);
  }

  return previewProject(projects, groups, snap);
}

function baseTree(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  const tree = buildTree(projects, groups);
  return injectSourceSlot(tree, projects, groups, snap);
}

function injectSourceSlot(
  tree: TreeItem[],
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  if (snap.sourceItem?.type !== "project") return tree;
  const sourceProject = projects.find((p) => p.id === snap.sourceId);
  if (!sourceProject?.group_id) return tree;
  const g = groups.find((grp) => grp.id === sourceProject.group_id);
  if (!g || g.collapsed) return tree;

  const result = [...tree];
  let lastIdx = -1;
  for (let i = 0; i < result.length; i += 1) {
    if (result[i].project?.group_id === sourceProject.group_id) {
      lastIdx = i;
    }
  }

  if (lastIdx >= 0) {
    result.splice(lastIdx + 1, 0, {
      type: "group-slot",
      id: `slot-${sourceProject.group_id}`,
      groupId: sourceProject.group_id,
    });
  } else if (projects.filter((project) => project.group_id === sourceProject.group_id).length === 1) {
    const insertAt = findSourceGroupShellInsertIndex(result, projects, groups, sourceProject.group_id);
    result.splice(insertAt, 0, ...makeGroupShell(g));
  }

  return result;
}

function makeGroupShell(group: GroupInfo): TreeItem[] {
  return [
    {
      type: "group-header",
      id: group.id,
      groupId: group.id,
      groupName: group.name,
      groupColor: group.color,
      groupCollapsed: group.collapsed,
      groupItemCount: 0,
    },
    {
      type: "group-slot",
      id: `slot-${group.id}`,
      groupId: group.id,
    },
  ];
}

function findSourceGroupShellInsertIndex(
  result: TreeItem[],
  projects: Project[],
  groups: GroupInfo[],
  sourceGroupId: string
): number {
  const original = buildTree(projects, groups);
  const headerIndex = original.findIndex(
    (item) => item.type === "group-header" && item.groupId === sourceGroupId
  );
  if (headerIndex <= 0) return 0;

  for (let index = headerIndex - 1; index >= 0; index -= 1) {
    const anchorId = original[index].id;
    const resultIndex = result.findIndex((item) => item.id === anchorId);
    if (resultIndex >= 0) return resultIndex + 1;
  }

  return 0;
}

function previewProject(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  const sourceItem = snap.sourceItem!;
  const targetItem = snap.targetItem!;
  const { zone } = snap;

  if (targetItem.type === "group-header") {
    return previewProjectAroundGroupBlock(projects, groups, snap);
  }

  const preview = projects.map((p) => ({ ...p }));
  const si = preview.findIndex((p) => p.id === sourceItem.id);
  const ti = preview.findIndex((p) => p.id === targetItem.id);
  if (si === -1 || ti === -1) return buildTree(projects, groups);

  const targetProject = preview[ti];
  let newGroupId: string | null = null;
  let insertAt: number;

  if (zone === "before") {
    insertAt = ti;
    newGroupId = targetProject.group_id;
  } else if (zone === "after") {
    insertAt = ti + 1;
    newGroupId = targetProject.group_id;
  } else {
    const sourceIsAboveTarget = si < ti;
    if (targetProject.group_id) {
      newGroupId = targetProject.group_id;
      if (preview[si].group_id === targetProject.group_id) {
        insertAt = sourceIsAboveTarget ? ti : ti + 1;
      } else {
        insertAt = sourceIsAboveTarget ? ti : ti + 1;
        const gid = newGroupId;
        if (!sourceIsAboveTarget) {
          for (let i = ti + 1; i < preview.length; i += 1) {
            if (preview[i].group_id === gid) insertAt = i + 1;
            else break;
          }
        }
      }
    } else {
      insertAt = sourceIsAboveTarget ? ti : ti + 1;
    }
  }

  const [src] = preview.splice(si, 1);
  src.group_id = newGroupId;
  const adjustedAt = si < insertAt ? insertAt - 1 : insertAt;
  preview.splice(adjustedAt, 0, src);
  const tree = buildTree(preview, groups);
  return injectSourceSlot(tree, projects, groups, snap);
}

function previewProjectAroundGroupBlock(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  const sourceItem = snap.sourceItem!;
  const targetGroupId = snap.targetItem?.groupId;
  if (!targetGroupId) return buildTree(projects, groups);

  const preview = projects.map((p) => ({ ...p }));
  const si = preview.findIndex((p) => p.id === sourceItem.id);
  if (si === -1) return buildTree(projects, groups);

  const [src] = preview.splice(si, 1);
  const insertAt = findFirstProjectIndexInGroup(preview, targetGroupId);
  src.group_id = snap.zone === "after" ? targetGroupId : null;

  preview.splice(Math.max(0, insertAt), 0, src);
  const tree = buildTree(preview, groups);
  return injectSourceSlot(tree, projects, groups, snap);
}

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
  src.group_id = null;

  const slotGroupId = snap.targetItem?.groupId;
  if (slotGroupId) {
    let insertAt = -1;
    for (let i = preview.length - 1; i >= 0; i -= 1) {
      if (preview[i].group_id === slotGroupId) {
        insertAt = i + 1;
        break;
      }
    }
    if (insertAt < 0) {
      insertAt = findProjectInsertIndexForEmptyGroup(preview, projects, groups, slotGroupId);
    }
    preview.splice(insertAt, 0, src);
  } else {
    preview.push(src);
  }

  const tree = buildTree(preview, groups);
  return injectSourceSlot(tree, projects, groups, snap);
}

function findProjectInsertIndexForEmptyGroup(
  preview: Project[],
  originalProjects: Project[],
  groups: GroupInfo[],
  groupId: string
): number {
  const originalTree = buildTree(originalProjects, groups);
  const headerIndex = originalTree.findIndex(
    (item) => item.type === "group-header" && item.groupId === groupId
  );
  if (headerIndex < 0) return preview.length;

  for (let index = headerIndex - 1; index >= 0; index -= 1) {
    const anchorProjectId = originalTree[index].project?.id;
    if (!anchorProjectId) continue;

    const anchorIndex = preview.findIndex((project) => project.id === anchorProjectId);
    if (anchorIndex >= 0) return anchorIndex + 1;
  }

  return 0;
}

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
  const headerIdx = tree.findIndex((it) => it.id === sourceItem.id);
  if (headerIdx === -1) return tree;

  let blockEnd = tree.length;
  for (let i = headerIdx + 1; i < tree.length; i += 1) {
    const item = tree[i];
    if (
      item.type === "group-header" ||
      (item.type === "project" && item.project?.group_id !== sourceGroupId) ||
      (item.type === "group-slot" && item.groupId !== sourceGroupId)
    ) {
      blockEnd = i;
      break;
    }
  }

  const block = tree.slice(headerIdx, blockEnd);
  const remaining = [...tree.slice(0, headerIdx), ...tree.slice(blockEnd)];
  const targetIdx = remaining.findIndex((it) => it.id === targetItem.id);
  if (targetIdx < 0) return tree;

  const targetBlock = findTreeBlockBounds(remaining, targetIdx);
  const pos = zone === "after" ? targetBlock.end : targetBlock.start;
  remaining.splice(pos, 0, ...block);
  return remaining;
}

function findFirstProjectIndexInGroup(projects: Project[], groupId: string): number {
  const index = projects.findIndex((project) => project.group_id === groupId);
  return index >= 0 ? index : projects.length;
}

function findTreeBlockBounds(tree: TreeItem[], index: number): { start: number; end: number } {
  const item = tree[index];
  const groupId = item.groupId ?? item.project?.group_id ?? null;
  if (!groupId) return { start: index, end: index + 1 };

  let start = index;
  while (start > 0) {
    const previous = tree[start - 1];
    if (previous.type === "group-header") {
      if (previous.groupId === groupId) start -= 1;
      break;
    }
    if (previous.project?.group_id !== groupId && previous.groupId !== groupId) break;
    start -= 1;
  }

  let end = index + 1;
  while (end < tree.length) {
    const next = tree[end];
    if (next.type === "group-header") break;
    if (next.project?.group_id !== groupId && next.groupId !== groupId) break;
    end += 1;
  }

  return { start, end };
}
