import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppStore, buildDynamicTree, computeFinalOrder, findEnclosingGroup, nextGroupColor } from "../lib/store";
import type { TreeItem } from "../lib/store";
import type { Project, GroupInfo } from "../lib/tauri";
import { useT } from "../lib/i18n";
import { log } from "../lib/draglog";
import { Home, Folder, Star, Plus, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";
import { Modifier } from "@dnd-kit/abstract";
import type { DragDropManager } from "@dnd-kit/dom";

type Zone = "before" | "onto" | "after" | null;
const SWAP_THRESHOLD = 0.12;
const AUTO_EXPAND_DELAY = 400;

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

class RestrictToVertical extends Modifier<DragDropManager> {
  constructor(manager: DragDropManager) {
    super(manager);
  }
  apply({ transform }: DragDropManager["dragOperation"]) {
    return { x: 0, y: transform.y };
  }
}

export function ProjectList() {
  const t = useT();
  const projects = useAppStore((s) => s.projects);
  const groups = useAppStore((s) => s.groups);
  const savedSelected = useAppStore((s) => s.selectedProjectId);
  const selectProject = useAppStore((s) => s.selectProject);
  const addProject = useAppStore((s) => s.addProject);
  const openCreateProject = useAppStore((s) => s.openCreateProject);
  const reorderAll = useAppStore((s) => s.reorderAll);
  const createGroup = useAppStore((s) => s.createGroup);
  const renameGroup = useAppStore((s) => s.renameGroup);
  const toggleGroup = useAppStore((s) => s.toggleGroup);
  const batchMoveAndReorder = useAppStore((s) => s.batchMoveAndReorder);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const loadGroups = useAppStore((s) => s.loadGroups);
  const loadSettings = useAppStore((s) => s.loadSettings);

  useEffect(() => { loadProjects(); loadGroups(); loadSettings(); }, []);

  const [filter, setFilter] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragZone, setDragZone] = useState<Zone>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [ontoGroupId, setOntoGroupId] = useState<string | null>(null);

  const dragStateRef = useRef<{ zone: Zone; targetId: string | null; ontoGroupId: string | null }>({ zone: null, targetId: null, ontoGroupId: null });
  const sourceIdxRef = useRef<number>(-1);
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoExpandTargetRef = useRef<string | null>(null);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const pendingDragStateRef = useRef<{ zone: Zone; targetId: string | null; ontoGroupId: string | null } | null>(null);
  const isDragging = activeId !== null;

  const flushDragState = useCallback(() => {
    rafRef.current = null;
    const s = pendingDragStateRef.current;
    if (!s) return;
    pendingDragStateRef.current = null;
    setDragZone(s.zone);
    setDragTargetId(s.targetId);
    setOntoGroupId(s.ontoGroupId);
  }, []);

  const scheduleDragStateFlush = useCallback((zone: Zone, targetId: string | null, ontoGroupId: string | null) => {
    dragStateRef.current = { zone, targetId, ontoGroupId };
    pendingDragStateRef.current = { zone, targetId, ontoGroupId };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(flushDragState);
    }
  }, [flushDragState]);

  const sourceGroupId = useMemo(() => {
    if (!activeId) return null;
    const p = projects.find((pr) => pr.id === activeId);
    if (p) return p.group_id || null;
    const g = groups.find((gr) => gr.id === activeId);
    if (g) return g.id;
    return null;
  }, [activeId, projects, groups]);

  const flatTree = useMemo(
    () => buildDynamicTree(projects, groups, isDragging, sourceGroupId),
    [projects, groups, isDragging, sourceGroupId]
  );
  const itemMap = useMemo(() => new Map(flatTree.map((i) => [i.id, i])), [flatTree]);

  useEffect(() => {
    if (isDragging && activeId) {
      sourceIdxRef.current = flatTree.findIndex((it) => it.id === activeId);
    }
  }, [flatTree, isDragging, activeId]);

  const itemVisible = useMemo(() => {
    const map = new Map<string, boolean>();
    let skipGroup: string | null = null;
    for (const item of flatTree) {
      if (item.type === "group-slot") {
        map.set(item.id, true);
      } else if (item.type === "group-header") {
        map.set(item.id, true);
        skipGroup = item.groupCollapsed ? item.groupId! : null;
      } else {
        const inCollapsed = !!skipGroup && item.project?.group_id === skipGroup;
        const filteredOut = !!filter && !item.project?.name.toLowerCase().includes(filter.toLowerCase());
        map.set(item.id, !inCollapsed && !filteredOut);
      }
    }
    const emptyGroups = new Set<string>();
    for (const item of flatTree) {
      if (item.type === "group-header" && !item.groupCollapsed && item.groupId) {
        emptyGroups.add(item.groupId);
      }
    }
    for (const item of flatTree) {
      if (item.type === "project" && item.project?.group_id && map.get(item.id)) {
        emptyGroups.delete(item.project.group_id);
      }
    }
    for (const gid of emptyGroups) {
      map.set(gid, false);
    }
    return map;
  }, [flatTree, filter]);

  const pointerSensor = useMemo(() => PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Delay({ value: 300, tolerance: 5 })],
  }), []);

  const clearAutoExpandTimer = () => {
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
    autoExpandTargetRef.current = null;
  };

  const computeZone = (y: number, rect: DOMRect, targetIdx: number): Zone => {
    if (targetIdx === sourceIdxRef.current) return null;
    const ratio = (y - rect.top) / rect.height;
    if (ratio < SWAP_THRESHOLD) return "before";
    if (ratio > 1 - SWAP_THRESHOLD) return "after";
    return "onto";
  };

  const resolveTargetFromPoint = (x: number, y: number): { id: string; element: HTMLElement } | null => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    const target = el.closest("[data-dnd-item-id]") as HTMLElement | null;
    if (!target) return null;
    const id = target.getAttribute("data-dnd-item-id");
    if (!id) return null;
    return { id, element: target };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragStart = useCallback((e: any) => {
    const sourceId = e.operation?.source?.id;
    if (!sourceId) return;
    setActiveId(sourceId);
    setDragZone(null);
    setDragTargetId(null);
    setOntoGroupId(null);
    dragStateRef.current = { zone: null, targetId: null, ontoGroupId: null };
    clearAutoExpandTimer();
    sourceIdxRef.current = flatTree.findIndex((it) => it.id === sourceId);
    const srcItem = itemMap.get(sourceId);
    const srcGroup = srcItem?.type === "project" ? srcItem.project?.group_id : srcItem?.groupId;
    log.dragStart(sourceId, sourceIdxRef.current, srcGroup,
      flatTree.map((it) => ({ id: it.id, type: it.type, gid: it.project?.group_id ?? it.groupId ?? null }))
    );
  }, [flatTree, itemMap]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragOver = useCallback((e: any) => {
    const target = e.operation?.target;
    let targetId: string | null = null;
    let targetEl: HTMLElement | null = null;
    let method: "sortable" | "point" = "sortable";

    if (target) {
      targetId = target.id as string;
      targetEl = (target as { element?: Element }).element as HTMLElement | null;
    } else if (e.operation?.position) {
      method = "point";
      const pos = e.operation.position;
      const resolved = resolveTargetFromPoint(pos.x, pos.y);
      if (resolved) {
        targetId = resolved.id;
        targetEl = resolved.element;
      }
    }

    if (!targetId || !targetEl) {
      clearAutoExpandTimer();
      if (dragStateRef.current.zone !== null) {
        log.dragOverNull();
      }
      const prev = dragStateRef.current;
      if (prev.zone === null && prev.targetId === null) return;
      scheduleDragStateFlush(null, null, null);
      return;
    }

    const targetIdx = flatTree.findIndex((it) => it.id === targetId);
    if (targetIdx < 0) return;

    const rect = targetEl.getBoundingClientRect();
    const targetItem = itemMap.get(targetId);
    let zone = computeZone(e.operation?.position?.y || 0, rect, targetIdx);
    if (targetItem?.type === "group-slot") zone = "onto";

    let tgid: string | null = null;
    if (zone === "onto") {
      if (targetItem) {
        if (targetItem.type === "group-slot") tgid = targetItem.groupId || null;
        else if (targetItem.type === "group-header") tgid = targetItem.groupId || null;
        else if (targetItem.project?.group_id) tgid = targetItem.project.group_id;
      }
    } else if (zone === "before" || zone === "after") {
      if (targetItem) {
        if (targetItem.type === "group-header") tgid = targetItem.groupId || null;
        else if (targetItem.project?.group_id) tgid = targetItem.project.group_id;
      }
    }

    if (targetIdx !== sourceIdxRef.current) {
      log.dragOverTarget(method, targetId, targetItem?.type, zone, tgid,
        rect.height > 0 ? ((e.operation?.position?.y || 0) - rect.top) / rect.height : 0);
    }

    if (targetItem?.type === "group-header" && targetItem.groupCollapsed) {
      if (autoExpandTargetRef.current !== targetId) {
        autoExpandTargetRef.current = targetId;
        clearAutoExpandTimer();
        autoExpandTimerRef.current = setTimeout(() => {
          if (targetItem.groupId) { toggleGroup(targetItem.groupId, false); log.autoExpand(targetItem.groupId, true); }
          autoExpandTimerRef.current = null;
          autoExpandTargetRef.current = null;
        }, AUTO_EXPAND_DELAY);
      }
    } else {
      clearAutoExpandTimer();
    }

    const prev = dragStateRef.current;
    if (prev.zone === zone && prev.targetId === targetId) return;
    if (zone === null && prev.zone !== null) return;
    scheduleDragStateFlush(zone, targetId, tgid);
  }, [flatTree, itemMap, toggleGroup, scheduleDragStateFlush]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragEnd = useCallback((e: any) => {
    const source = e.operation?.source;
    const { zone, targetId: endTargetId } = dragStateRef.current;

    setActiveId(null);
    setDragZone(null);
    setDragTargetId(null);
    setOntoGroupId(null);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    pendingDragStateRef.current = null;
    dragStateRef.current = { zone: null, targetId: null, ontoGroupId: null };
    clearAutoExpandTimer();

    if (!source) return;

    const sourceId = source.id as string;
    const srcInitialIdx = source.initialIndex;
    const srcNewIdx = source.index;

    if (!endTargetId || !zone) {
      if (srcNewIdx !== srcInitialIdx && srcNewIdx >= 0 && srcInitialIdx >= 0) {
        const reordered = arrayMove(flatTree, srcInitialIdx, srcNewIdx);
        const liveProjects = useAppStore.getState().projects;
        const finalProjectIds = computeFinalOrder(reordered, liveProjects);
        log.beforeOrder("NO_TARGET", liveProjects);
        const sp = liveProjects.find((p) => p.id === sourceId);
        const newEnclosing = findEnclosingGroup(reordered, srcNewIdx);
        if (sp?.group_id) {
          if (newEnclosing !== sp.group_id) {
            log.dragEnd("NO_TARGET_UNGROUP", sourceId, null, null, [{ projectId: sourceId, groupId: null }]);
            batchMoveAndReorder([{ projectId: sourceId, groupId: null }], finalProjectIds);
            return;
          }
        }
        log.dragEnd("NO_TARGET_REORDER", sourceId, null, null, null);
        reorderAll(finalProjectIds);
      }
      return;
    }

    if (source.id === endTargetId) return;

    const sourceItem = itemMap.get(sourceId);
    const targetItem = itemMap.get(endTargetId);
    if (!sourceItem || !targetItem) return;

    const sourceFlatIdx = flatTree.findIndex((it) => it.id === sourceId);
    const targetFlatIdx = flatTree.findIndex((it) => it.id === endTargetId);
    if (sourceFlatIdx === -1 || targetFlatIdx === -1) return;

    if (zone === "onto") {
      if (sourceItem.type === "group-header") {
        log.dragEnd("ONTO_GROUP_HEADER_DOWNGRADE", sourceId, endTargetId, zone, null);
        handleGroupAsBefore(sourceItem, endTargetId, sourceFlatIdx, targetFlatIdx, "before", {
          projects: useAppStore.getState().projects,
          groups: useAppStore.getState().groups,
          flatTree,
          reorderAll,
        });
        return;
      }

      const targetGid = targetItem.type === "group-slot"
        ? targetItem.groupId
        : targetItem.type === "group-header"
        ? targetItem.groupId || null
        : targetItem.project?.group_id || null;

      if (targetItem.type === "group-slot" && targetGid) {
        const liveProjects = useAppStore.getState().projects;
        const no = liveProjects.map((p) => p.id);
        const si = no.indexOf(sourceId), ti = no.indexOf(endTargetId);
        if (si !== -1 && ti !== -1) { no.splice(si, 1); no.splice(ti - (si < ti ? 1 : 0), 0, sourceId); }
        log.dragEnd("ONTO_UNGROUP", sourceId, endTargetId, zone, [{ projectId: sourceId, groupId: null }]);
        log.beforeOrder("UNGROUP", liveProjects);
        batchMoveAndReorder([{ projectId: sourceId, groupId: null }], no);
        return;
      }

      if (targetGid) {
        const sp = useAppStore.getState().projects.find((p) => p.id === sourceId);
        if (sp?.group_id === targetGid) return;
        const targetGroup = groups.find((g) => g.id === targetGid);
        if (targetGroup?.collapsed) {
          toggleGroup(targetGid, false);
        }
        const liveProjects = useAppStore.getState().projects;
        const no = liveProjects.map((p) => p.id);
        const si = no.indexOf(sourceId), ti = no.indexOf(endTargetId);
        if (si !== -1 && ti !== -1) { no.splice(si, 1); no.splice(ti - (si < ti ? 1 : 0), 0, sourceId); }
        log.dragEnd("ONTO_JOIN", sourceId, endTargetId, zone, [{ projectId: sourceId, groupId: targetGid }]);
        log.beforeOrder("JOIN", liveProjects);
        batchMoveAndReorder([{ projectId: sourceId, groupId: targetGid }], no);
      } else {
        const color = nextGroupColor(groups);
        const newGroupName = t.groupDefaultName(groups.length + 1);
        log.dragEnd("ONTO_CREATE_GROUP", sourceId, endTargetId, zone, null);
        createGroup(newGroupName, color).then((ngid) => {
          const liveProjects = useAppStore.getState().projects;
          const no = liveProjects.map((p) => p.id);
          const si = no.indexOf(sourceId), ti = no.indexOf(endTargetId);
          if (si !== -1 && ti !== -1) { no.splice(si, 1); no.splice(ti - (si < ti ? 1 : 0), 0, sourceId); }
          log.beforeOrder("CREATE_GROUP", liveProjects);
          batchMoveAndReorder([
            { projectId: sourceId, groupId: ngid },
            { projectId: endTargetId, groupId: ngid }
          ], no);
        }).catch((err) => { console.error("createGroup failed", err); });
      }
      return;
    }

    const isGroupHeader = sourceItem.type === "group-header";
    if (isGroupHeader) {
      const gid = sourceItem.groupId;
      const groupChanges = gid ? [{ projectId: gid, groupId: null }] : null;
      log.dragEnd(`GROUP_HEADER_${zone.toUpperCase()}`, sourceId, endTargetId, zone, groupChanges as { projectId: string; groupId: string | null }[] | null);
      handleGroupAsBefore(sourceItem, endTargetId, sourceFlatIdx, targetFlatIdx, zone, {
        projects: useAppStore.getState().projects,
        groups: useAppStore.getState().groups,
        flatTree,
        reorderAll,
      });
      return;
    }

    const liveProjects = useAppStore.getState().projects;
    const sp = liveProjects.find((p) => p.id === sourceId);

    if (!sp?.group_id) {
      const targetGidInReorder = targetItem.type === "group-header"
        ? targetItem.groupId
        : targetItem.type === "group-slot"
        ? targetItem.groupId
        : targetItem.project?.group_id || null;
      if (targetGidInReorder) {
        const no = liveProjects.map((p) => p.id);
        const si = no.indexOf(sourceId), ti = no.indexOf(endTargetId);
        if (si !== -1 && ti !== -1) { no.splice(si, 1); no.splice(ti - (si < ti ? 1 : 0), 0, sourceId); }
        const targetGroup = groups.find((g) => g.id === targetGidInReorder);
        if (targetGroup?.collapsed) toggleGroup(targetGidInReorder, false);
        log.dragEnd("BEFORE_AFTER_JOIN", sourceId, endTargetId, zone, [{ projectId: sourceId, groupId: targetGidInReorder }]);
        log.beforeOrder("BF_JOIN", liveProjects);
        batchMoveAndReorder([{ projectId: sourceId, groupId: targetGidInReorder }], no);
        return;
      }
    }

    const insertAt = zone === "before" ? targetFlatIdx : targetFlatIdx + 1;
    const to = insertAt > sourceFlatIdx ? insertAt - 1 : insertAt;
    const reordered = arrayMove(flatTree, sourceFlatIdx, Math.max(0, Math.min(to, flatTree.length - 1)));

    const finalProjectIds = computeFinalOrder(reordered, liveProjects);

    if (sp?.group_id) {
      const newIdx = reordered.findIndex((it) => it.id === sourceId);
      const enclosing = findEnclosingGroup(reordered, newIdx);
      if (enclosing !== sp.group_id) {
        log.dragEnd("BEFORE_AFTER_UNGROUP", sourceId, endTargetId, zone, [{ projectId: sourceId, groupId: null }]);
        log.beforeOrder("BF_UNGROUP", liveProjects);
        batchMoveAndReorder([{ projectId: sourceId, groupId: null }], finalProjectIds);
        return;
      }
    }

    log.dragEnd("BEFORE_AFTER_REORDER", sourceId, endTargetId, zone, null);
    reorderAll(finalProjectIds);
  }, [flatTree, itemMap, groups, reorderAll, createGroup, toggleGroup, batchMoveAndReorder, t]);

  const handleGroupAsBefore = (
    sourceItem: TreeItem,
    _targetId: string,
    sourceFlatIdx: number,
    _targetFlatIdx: number,
    zone: Zone,
    ctx: {
      projects: Project[];
      groups: GroupInfo[];
      flatTree: TreeItem[];
      reorderAll: (ids: string[]) => void;
    }
  ) => {
    const insertAt = zone === "after" ? _targetFlatIdx + 1 : _targetFlatIdx;
    const to = insertAt > sourceFlatIdx ? insertAt - 1 : insertAt;
    let reordered = arrayMove(ctx.flatTree, sourceFlatIdx, Math.max(0, Math.min(to, ctx.flatTree.length - 1)));

    const gid = sourceItem.groupId;
    if (gid) {
      const groupProjIds = new Set(ctx.projects.filter((p) => p.group_id === gid).map((p) => p.id));
      const withoutProjects = reordered.filter((it) => it.type !== "project" || !groupProjIds.has(it.id));
      const headerIdx = withoutProjects.findIndex((it) => it.id === sourceItem.id);
      const groupProjects = reordered.filter((it) => it.type === "project" && groupProjIds.has(it.id));
      if (headerIdx !== -1) {
        withoutProjects.splice(headerIdx + 1, 0, ...groupProjects);
        reordered = withoutProjects;
      }
    }

    const finalProjectIds = computeFinalOrder(reordered, ctx.projects);
    ctx.reorderAll(finalProjectIds);
  };

  const handleGroupRename = (gid: string) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    setEditingGroupId(gid);
    setEditName(g.name);
  };
  const commitRename = () => {
    if (editingGroupId && editName.trim()) renameGroup(editingGroupId, editName.trim());
    setEditingGroupId(null);
  };
  const handleAdd = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: t.selectFolderTitle });
      if (dir) { const n = dir.split(/[\\/]/).pop() || t.unnamed; await addProject(n, dir as string); }
    } catch (e) { console.error("Failed to add project:", e); }
  };

  const activeItem = activeId ? itemMap.get(activeId) : null;

  return (
    <DragDropProvider
      plugins={(defaults) => [...defaults, pointerSensor]}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <aside style={{ width: 260, background: "var(--color-base)", display: "flex", flexDirection: "column", flexShrink: 0, borderRight: "1px solid var(--color-hover)", position: "relative" }}>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>{t.projectListTitle}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={openCreateProject} title={t.newProject} style={{ background: "none", border: "none", color: "var(--color-primary-fg)", cursor: "pointer", lineHeight: 1, display: "flex" }}><Plus size={18} strokeWidth={1.5} /></button>
            <button onClick={handleAdd} title="Browse folder" style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", lineHeight: 1 }}><Plus size={18} strokeWidth={1.5} /></button>
          </div>
        </div>
        <input type="text" placeholder={t.filterPlaceholder} value={filter} onChange={(e) => !isDragging && setFilter(e.target.value)}
          style={{ margin: "0 12px 8px", background: "var(--color-card)", color: "var(--color-text-secondary)", border: "none", padding: "7px 12px", fontSize: 12, outline: "none" }} />
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0" }}>
          <div onClick={() => selectProject(null)}
            style={{ padding: "8px 14px", margin: "1px 4px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", opacity: 0.6 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-hover)"; e.currentTarget.style.opacity = "0.8"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = "0.6"; }}>
            <Home size={16} strokeWidth={1.5} /><span style={{ color: "var(--color-text-secondary)" }}>{t.homeItem}</span>
          </div>
          {flatTree.map((item, idx) => (
            <SortableTreeItem key={item.id} id={item.id} index={idx} item={item}
              visible={itemVisible.get(item.id) !== false}
              activeId={activeId}
              dragZone={dragZone} dragTargetId={dragTargetId} ontoGroupId={ontoGroupId}
              savedSelected={savedSelected} filterActive={!!filter && !isDragging}
              editingGroupId={editingGroupId} editName={editName} setEditName={setEditName} commitRename={commitRename}
              handleGroupRename={handleGroupRename} toggleGroup={toggleGroup} selectProject={selectProject}
              projects={projects} />
          ))}
        </div>
        <div style={{ padding: 8, borderTop: "1px solid var(--color-hover)", fontSize: 10, color: "var(--color-text-muted)", textAlign: "center" }}>
          {isDragging ? "Drop to reorder / group" : t.projectCount(projects.length)}
        </div>
      </aside>
      <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
        {activeItem && <OverlayCard item={activeItem} ontoGroupId={ontoGroupId} dragZone={dragZone} groups={groups} projects={projects} itemMap={itemMap} dragTargetId={dragTargetId} />}
      </DragOverlay>
    </DragDropProvider>
  );
}

/* ─── SortableTreeItem ─── */

interface SortableTreeItemProps {
  id: string;
  index: number;
  item: TreeItem;
  visible: boolean;
  activeId: string | null;
  dragZone: Zone;
  dragTargetId: string | null;
  ontoGroupId: string | null;
  savedSelected: string | null;
  filterActive: boolean;
  editingGroupId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  commitRename: () => void;
  handleGroupRename: (gid: string) => void;
  toggleGroup: (id: string, collapsed: boolean) => void;
  selectProject: (id: string | null) => void;
  projects: Project[];
}

function SortableTreeItem({ id, index, item, visible, activeId, dragZone, dragTargetId, ontoGroupId, savedSelected, filterActive,
  editingGroupId, editName, setEditName, commitRename, handleGroupRename, toggleGroup, selectProject, projects }: SortableTreeItemProps) {

  const isOntoTarget = dragZone === "onto" && dragTargetId === id;
  const isInOntoGroup = !!ontoGroupId && item.groupId === ontoGroupId;
  const disabled = !visible || filterActive || (isOntoTarget && item.type !== "group-slot");

  const { ref, handleRef, isDragSource } = useSortable({
    id, index,
    disabled,
    modifiers: [RestrictToVertical],
  });
  const isSource = activeId === id;

  if (!visible) {
    return (
      <div ref={ref} style={{ visibility: "hidden", height: 0, overflow: "hidden", margin: 0, padding: 0, border: "none", pointerEvents: "none" }}>
        <span ref={handleRef} />
      </div>
    );
  }

  if (item.type === "group-slot") {
    return (
      <div ref={ref} data-dnd-item-id={id}>
        <span ref={handleRef} style={{ display: "none" }} />
        <GroupSlotItem item={item} isOnto={isOntoTarget || isInOntoGroup} />
      </div>
    );
  }

  if (item.type === "group-header") {
    return (
      <div ref={ref} data-dnd-item-id={id}>
        <GroupHeaderItem ref_handle={handleRef} item={item} isSource={isSource} isOnto={isOntoTarget}
          isInOntoGroup={isInOntoGroup}
          editingGroupId={editingGroupId} editName={editName} setEditName={setEditName}
          commitRename={commitRename} handleGroupRename={handleGroupRename}
          toggleGroup={toggleGroup} isDragSource={isDragSource}
          projects={projects} dragZone={dragZone} dragTargetId={dragTargetId} itemId={id} />
      </div>
    );
  }

  const p: Project = item.project!;
  return (
    <div ref={ref} data-dnd-item-id={id}>
      <ProjectItem item={item} project={p} isSource={isSource} isOnto={isOntoTarget}
        isInOntoGroup={isInOntoGroup}
        handleRef={handleRef} savedSelected={savedSelected} itemId={id}
        isDragSource={isDragSource} selectProject={selectProject}
        filterActive={filterActive} dragZone={dragZone} dragTargetId={dragTargetId} />
    </div>
  );
}

/* ─── GroupHeaderItem ─── */

interface GroupHeaderItemProps {
  ref_handle: (el: Element | null) => void;
  item: TreeItem;
  isSource: boolean;
  isOnto: boolean;
  isInOntoGroup: boolean;
  editingGroupId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  commitRename: () => void;
  handleGroupRename: (gid: string) => void;
  toggleGroup: (id: string, collapsed: boolean) => void;
  isDragSource: boolean;
  projects: Project[];
  dragZone: Zone;
  dragTargetId: string | null;
  itemId: string;
}

function GroupHeaderItem({ ref_handle, item, isSource, isOnto, isInOntoGroup, editingGroupId, editName, setEditName,
  commitRename, handleGroupRename, toggleGroup, isDragSource, projects, dragZone, dragTargetId, itemId }: GroupHeaderItemProps) {
  const vc = projects.filter((p) => p.group_id === item.groupId).length;
  const showBefore = dragZone === "before" && dragTargetId === itemId;
  const showAfter = dragZone === "after" && dragTargetId === itemId;
  const highlight = isOnto || isInOntoGroup;

  return (
    <div style={{ position: "relative", margin: "1px 4px", display: "flex", alignItems: "center", background: highlight ? "var(--color-card)" : "transparent", opacity: isSource ? 0.4 : 1, borderLeft: item.groupColor ? `3px solid ${item.groupColor}` : "3px solid transparent" }}>
      {showBefore && <div className="drop-line drop-line-top" />}
      {showAfter && <div className="drop-line drop-line-bottom" />}
      <span ref={ref_handle} style={{ cursor: "grab", padding: "6px 4px", display: "flex", color: "var(--color-text-muted)", opacity: 0.6 }}>
        <GripVertical size={14} strokeWidth={1.5} />
      </span>
      <div onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (!isDragSource) toggleGroup(item.groupId!, !item.groupCollapsed); }}
        onDoubleClick={(e: React.MouseEvent) => { e.stopPropagation(); handleGroupRename(item.groupId!); }}
        style={{ flex: 1, display: "flex", alignItems: "center", padding: "6px 8px 6px 0", cursor: "pointer", gap: 4, minWidth: 0 }}>
        {item.groupCollapsed ? <ChevronRight size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
        {editingGroupId === item.id ? (
          <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename} onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditName(""); }}
            onClick={(e) => e.stopPropagation()} style={{ background: "var(--color-hover)", color: "var(--color-text)", border: "none", padding: "2px 6px", fontSize: 13, fontWeight: 600, outline: "none", fontFamily: "inherit", width: 120 }} />
        ) : (
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.groupName}</span>
        )}
      </div>
      <span style={{ fontSize: 10, color: "var(--color-text-muted)", marginRight: 8 }}>{item.groupCollapsed ? `(${vc})` : `${vc}`}</span>
    </div>
  );
}

/* ─── ProjectItem ─── */

interface ProjectItemProps {
  item: TreeItem;
  project: Project;
  isSource: boolean;
  isOnto: boolean;
  isInOntoGroup: boolean;
  handleRef: (el: Element | null) => void;
  savedSelected: string | null;
  itemId: string;
  isDragSource: boolean;
  selectProject: (id: string | null) => void;
  filterActive: boolean;
  dragZone: Zone;
  dragTargetId: string | null;
}

function ProjectItem({ item, project: p, isSource, isOnto, isInOntoGroup, handleRef, savedSelected, itemId, isDragSource, selectProject, filterActive, dragZone, dragTargetId }: ProjectItemProps) {
  const isGrouped = item.isGrouped;
  const groupColor = item.groupColor;
  const sel = savedSelected === itemId;
  const showBefore = dragZone === "before" && dragTargetId === itemId;
  const showAfter = dragZone === "after" && dragTargetId === itemId;
  const highlight = isOnto || isInOntoGroup;

  return (
    <div style={{ position: "relative" }}>
      {showBefore && <div className="drop-line drop-line-top" />}
      {showAfter && <div className="drop-line drop-line-bottom" />}
      <div style={{
        padding: isGrouped ? "7px 14px 7px 18px" : "8px 14px", margin: "1px 4px",
        display: "flex", alignItems: "center", gap: 4,
        cursor: filterActive ? "pointer" : "default",
        background: sel ? "var(--color-hover)" : (highlight ? "var(--color-card)" : "transparent"),
        borderLeft: sel ? "2px solid var(--color-primary)" : (isGrouped ? `3px solid ${groupColor || "transparent"}` : "2px solid transparent"),
        opacity: isSource ? 0 : 1,
        boxShadow: highlight ? `inset 0 0 0 2px ${isGrouped ? groupColor : "var(--color-primary)"}` : "none",
        userSelect: "none",
      }}
        onMouseEnter={(e: React.MouseEvent) => { if (sel !== true && !highlight) (e.currentTarget as HTMLElement).style.background = "var(--color-card)"; }}
        onMouseLeave={(e: React.MouseEvent) => { if (sel !== true && !highlight) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span ref={handleRef} style={{ cursor: "grab", display: "flex", color: "var(--color-text-muted)", opacity: 0.5 }}>
          <GripVertical size={14} strokeWidth={1.5} />
        </span>
        <div onClick={() => { if (!isDragSource) selectProject(itemId); }} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <Folder size={14} strokeWidth={1.5} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{p.name}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.path}</div>
          </div>
          {p.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
        </div>
      </div>
    </div>
  );
}

/* ─── GroupSlotItem ─── */

function GroupSlotItem({ isOnto }: { item: TreeItem; isOnto: boolean }) {
  const t = useT();
  return (
    <div style={{
      height: 40, margin: "1px 14px 1px 22px",
      border: `2px ${isOnto ? "solid var(--color-primary)" : "dashed var(--color-text-muted)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11,
      color: isOnto ? "var(--color-primary)" : "var(--color-text-muted)",
      opacity: 0.5,
      transition: "border-color 0.15s, color 0.15s",
    }}>
      {t.groupSlotText}
    </div>
  );
}

/* ─── OverlayCard ─── */

function OverlayCard({ item, ontoGroupId, dragZone, groups, projects, itemMap, dragTargetId }: {
  item: TreeItem;
  ontoGroupId: string | null;
  dragZone: Zone;
  groups: GroupInfo[];
  projects: Project[];
  itemMap: Map<string, TreeItem>;
  dragTargetId: string | null;
}) {
  const t = useT();
  if (!item) return null;

  const targetItem = dragTargetId ? itemMap.get(dragTargetId) : null;
  let badgeText: string | null = null;

  if (targetItem) {
    if (targetItem.type === "group-slot") {
      badgeText = t.ungroupBadge;
    } else if (ontoGroupId) {
      const g = groups.find((grp) => grp.id === ontoGroupId);
      if (g) badgeText = t.joinGroupBadge(g.name);
    } else if (dragZone === "onto") {
      badgeText = t.newGroupBadge;
    }
  }

  let leftIcon: React.ReactNode = null;
  if (targetItem?.type === "group-slot") {
    leftIcon = <Folder size={14} strokeWidth={1.5} />;
  } else if (ontoGroupId) {
    const g = groups.find((grp) => grp.id === ontoGroupId);
    if (g) {
      leftIcon = <div style={{ width: 3, height: 20, background: g.color, flexShrink: 0 }} />;
    } else {
      leftIcon = <Folder size={14} strokeWidth={1.5} />;
    }
  }

  return (
    <div style={{ width: 220, background: "var(--color-panel)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-text)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)", pointerEvents: "none" }}>
      {item.type === "group-header" ? (
        <>
          <div style={{ width: 3, height: 20, background: item.groupColor, flexShrink: 0 }} />
          <ChevronDown size={14} strokeWidth={1.5} />
          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.groupName}</span>
          <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{projects.filter((x) => x.group_id === item.groupId).length}</span>
        </>
      ) : (
        <>
          {leftIcon || <Folder size={14} strokeWidth={1.5} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.project?.name}</span>
          {item.project?.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
        </>
      )}
      {badgeText && (
        <span style={{ fontSize: 10, color: "var(--color-primary-fg)", whiteSpace: "nowrap", marginLeft: 4, padding: "1px 6px", background: "var(--color-hover)" }}>
          {badgeText}
        </span>
      )}
    </div>
  );
}
