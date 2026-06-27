import type { DragIntent, DragSnapshot, DragCallbacks } from "./state";
import type { TreeItem } from "../store";
import { computeFinalOrder, nextGroupColor } from "../store";
import type { Project, GroupInfo } from "../tauri";

export function resolveIntent(snap: DragSnapshot): DragIntent {
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

  if (sourceItem.type === "group-header") return "move_group_block";
  if (targetItem.type === "group-slot") return "ungroup";

  if (zone === "onto") {
    const sourceGroupId = sourceItem.project?.group_id ?? null;
    const targetGroupId = targetItem.project?.group_id ?? targetItem.groupId ?? null;

    if (targetGroupId) {
      return sourceGroupId === targetGroupId ? "reorder" : "join_group";
    }

    return "create_group";
  }

  return "reorder";
}

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

  const finalOrder = computeFinalOrder(previewTree, projects);

  if (intent === "cancel") return;

  if (intent === "reorder") {
    const sourceProject = projects.find((project) => project.id === sourceId);
    const targetGroupId = getTargetGroupId(targetItem);

    if (sourceProject?.group_id !== targetGroupId) {
      if (targetGroupId) {
        const targetGroup = groups.find((group) => group.id === targetGroupId);
        if (targetGroup?.collapsed) {
          cbs.toggleGroup(targetGroupId, false);
        }
      }

      await cbs.batchMoveAndReorder(
        [{ projectId: sourceId, groupId: targetGroupId }],
        finalOrder
      );
      return;
    }

    cbs.reorderAll(finalOrder);
    return;
  }

  if (intent === "join_group") {
    const ontoGroup = snap.ontoGroupId ?? getTargetGroupId(targetItem);
    if (!ontoGroup) return;

    const sourceProject = projects.find((project) => project.id === sourceId);
    if (sourceProject?.group_id === ontoGroup) {
      cbs.reorderAll(finalOrder);
      return;
    }

    const targetGroup = groups.find((group) => group.id === ontoGroup);
    if (targetGroup?.collapsed) {
      cbs.toggleGroup(ontoGroup, false);
    }

    await cbs.batchMoveAndReorder(
      [{ projectId: sourceId, groupId: ontoGroup }],
      finalOrder
    );
    return;
  }

  if (intent === "create_group") {
    const color = nextGroupColor(groups);
    const name = nextAvailableGroupName(groups, cbs.t.groupDefaultName);
    const groupId = await cbs.createGroup(name, color);

    await cbs.batchMoveAndReorder(
      [
        { projectId: sourceId, groupId },
        { projectId: targetId, groupId },
      ],
      finalOrder
    );
    return;
  }

  if (intent === "ungroup") {
    await cbs.batchMoveAndReorder(
      [{ projectId: sourceId, groupId: null }],
      finalOrder
    );
    return;
  }

  if (intent === "move_group_block") {
    if (!sourceItem || sourceItem.type !== "group-header") return;

    const groupId = sourceItem.groupId;
    if (groupId) {
      const sourceGroup = groups.find((group) => group.id === groupId);
      if (sourceGroup?.collapsed) {
        cbs.toggleGroup(groupId, false);
      }
    }

    cbs.reorderAll(finalOrder);
  }
}

function getTargetGroupId(targetItem: TreeItem | null): string | null {
  if (!targetItem) return null;
  if (targetItem.type === "group-header" || targetItem.type === "group-slot") {
    return targetItem.groupId ?? null;
  }
  return targetItem.project?.group_id ?? null;
}

function nextAvailableGroupName(
  groups: GroupInfo[],
  groupDefaultName: (index: number) => string
): string {
  const usedNames = new Set(groups.map((group) => group.name.trim()));

  for (let index = groups.length + 1; index < groups.length + 1000; index += 1) {
    const name = groupDefaultName(index);
    if (!usedNames.has(name.trim())) return name;
  }

  return groupDefaultName(groups.length + 1);
}
