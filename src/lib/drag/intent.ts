import type { DragIntent, DragSnapshot, DragCallbacks } from "./state";
import type { TreeItem } from "../store";
import { computeFinalOrder, findEnclosingGroup, nextGroupColor } from "../store";
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

  if (sourceItem.type === "group-header") {
    return "move_group_block";
  }

  if (targetItem.type === "group-slot") return "ungroup";

  if (zone === "onto") {
    if (targetItem.project?.group_id) return "join_group";
    if (!targetItem.project?.group_id && !sourceItem.project?.group_id) {
      return "create_group";
    }
    return "join_group";
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
    const sp = projects.find((p) => p.id === sourceId);
    const newIdx = previewTree.findIndex((it) => it.id === sourceId);
    const enclosing = findEnclosingGroup(previewTree, newIdx);

    if (sp?.group_id) {
      if (enclosing !== sp.group_id) {
        await cbs.batchMoveAndReorder(
          [{ projectId: sourceId, groupId: null }],
          finalOrder
        );
        return;
      }
    } else if (enclosing && targetItem) {
      const targetGroup = groups.find((g) => g.id === enclosing);
      if (targetGroup?.collapsed) {
        cbs.toggleGroup(enclosing, false);
      }
      await cbs.batchMoveAndReorder(
        [{ projectId: sourceId, groupId: enclosing }],
        finalOrder
      );
      return;
    }

    cbs.reorderAll(finalOrder);
    return;
  }

  if (intent === "join_group") {
    const ontoGroup = snap.ontoGroupId;
    if (!ontoGroup) return;

    const sp = projects.find((p) => p.id === sourceId);
    if (sp?.group_id === ontoGroup) {
      cbs.reorderAll(finalOrder);
      return;
    }

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

  if (intent === "create_group") {
    const color = nextGroupColor(groups);
    const name = cbs.t.groupDefaultName(groups.length + 1);
    const ngid = await cbs.createGroup(name, color);
    await cbs.batchMoveAndReorder(
      [
        { projectId: sourceId, groupId: ngid },
        { projectId: targetId, groupId: ngid },
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

    const gid = sourceItem.groupId;
    if (gid) {
      const targetGroup = groups.find((g) => g.id === gid);
      if (targetGroup?.collapsed) {
        cbs.toggleGroup(gid, false);
      }
    }
    cbs.reorderAll(finalOrder);
    return;
  }
}
