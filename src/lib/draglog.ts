const DRAG_PREFIX = "[DRAG]";

function devLog(event: string, data: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.log(DRAG_PREFIX, JSON.stringify({ t: Date.now(), e: event, ...data }));
  }
}

export const log = {
  dragStart: (sourceId: string, sourceIdx: number, sourceGroup: string | null | undefined, flatTreeSnapshot: { id: string; type: string; gid?: string | null }[]) =>
    devLog("START", { sourceId, sourceIdx, sourceGroup, tree: flatTreeSnapshot }),

  dragOverTarget: (method: "sortable" | "point", targetId: string, targetType: string | undefined, zone: string | null, ontoGroupId: string | null, yRatio: number) =>
    devLog("OVER_TARGET", { method, targetId, targetType, zone, ontoGroupId, yRatio }),

  dragOverNull: () =>
    devLog("OVER_NULL", {}),

  autoExpand: (groupId: string, triggers: boolean) =>
    devLog("AUTO_EXPAND", { groupId, triggers }),

  dragEnd: (path: string, sourceId: string, targetId: string | null, zone: string | null, groupChanges: { projectId: string; groupId: string | null }[] | null) =>
    devLog(`END:${path}`, { sourceId, targetId, zone, changes: groupChanges }),

  beforeOrder: (label: string, projects: { id: string; group_id: string | null }[]) =>
    devLog(`BEFORE_${label}`, { order: projects.map((p) => ({ id: p.id, gid: p.group_id })) }),

  afterOrder: (label: string, projects: { id: string; group_id: string | null }[]) =>
    devLog(`AFTER_${label}`, { order: projects.map((p) => ({ id: p.id, gid: p.group_id })) }),

  normalize: (input: { id: string; group_id: string | null }[], output: { id: string; group_id: string | null }[]) =>
    devLog("NORMALIZE", { in: input.map((p) => ({ id: p.id, gid: p.group_id })), out: output.map((p) => ({ id: p.id, gid: p.group_id })) }),

  api: (call: string, data: Record<string, unknown>, ok: boolean) =>
    devLog(`API:${call}`, { ok, ...data }),

  rollback: (reason: string, prevOrder: { id: string; group_id: string | null }[]) =>
    devLog("ROLLBACK", { reason, prev: prevOrder.map((p) => ({ id: p.id, gid: p.group_id })) }),
};
