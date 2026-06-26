import type { Project, GroupInfo } from "../tauri";
import type { TreeItem } from "../store";
import { buildTree } from "../store";
import type { DragSnapshot } from "./state";

export function computeDragPreview(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  if (
    snap.phase === "idle" ||
    !snap.sourceId ||
    !snap.targetId ||
    !snap.zone ||
    !snap.sourceItem ||
    !snap.targetItem
  ) {
    return buildTree(projects, groups);
  }

  if (snap.sourceId === snap.targetId) return buildTree(projects, groups);

  if (snap.sourceItem.type === "group-header") {
    return previewGroupHeader(projects, groups, snap);
  }

  return previewProject(projects, groups, snap);
}

function previewProject(
  projects: Project[],
  groups: GroupInfo[],
  snap: DragSnapshot
): TreeItem[] {
  const { zone } = snap;
  const sourceItem = snap.sourceItem!;
  const targetItem = snap.targetItem!;
  const sourceId = sourceItem.id;
  const targetId = targetItem.id;

  const preview = projects.map((p) => ({ ...p }));
  const si = preview.findIndex((p) => p.id === sourceId);
  const ti = preview.findIndex((p) => p.id === targetId);
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
    if (targetItem.type === "group-slot") {
      insertAt = ti;
      newGroupId = null;
    } else if (targetProject.group_id) {
      newGroupId = targetProject.group_id;
      insertAt = ti + 1;
      const gid = newGroupId;
      for (let i = ti + 1; i < preview.length; i++) {
        if (preview[i].group_id === gid) insertAt = i + 1;
        else break;
      }
    } else {
      insertAt = ti + 1;
      newGroupId = null;
    }
  }

  const [src] = preview.splice(si, 1);
  src.group_id = newGroupId;
  const adjustedAt = si < insertAt ? insertAt - 1 : insertAt;
  preview.splice(adjustedAt, 0, src);

  return buildTree(preview, groups);
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
  for (let i = headerIdx + 1; i < tree.length; i++) {
    if (tree[i].type === "group-header") {
      blockEnd = i;
      break;
    }
  }

  const block = tree.slice(headerIdx, blockEnd);
  const before = tree.slice(0, headerIdx);
  const after = tree.slice(blockEnd);

  const targetInBefore = before.findIndex((it) => it.id === targetItem.id);
  const targetInAfter = after.findIndex((it) => it.id === targetItem.id);

  if (targetInBefore >= 0) {
    const pos = zone === "after" ? targetInBefore + 1 : targetInBefore;
    before.splice(pos, 0, ...block);
    return [...before, ...after];
  }

  if (targetInAfter >= 0) {
    const pos = zone === "after" ? targetInAfter + 1 : targetInAfter;
    after.splice(pos, 0, ...block);
    return [...before, ...after];
  }

  return [...before, ...block, ...after];
}
