import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { log } from "../lib/draglog";
import { Home, Plus } from "lucide-react";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";

import {
  createEmptySnapshot,
  computeDragPreview,
  computeZone,
  resolveTargetFromPoint,
  deriveOntoGroupId,
  resolveIntent,
  executeIntent,
  useFlipAnimation,
} from "../lib/drag";
import type { DragSnapshot, DragZone } from "../lib/drag";

import { SortableTreeItem } from "./SortableTreeItem";
import { OverlayCard } from "./OverlayCard";

const AUTO_EXPAND_DELAY = 400;

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

  const [dragSnap, setDragSnap] = useState<DragSnapshot>(createEmptySnapshot());
  const snapRef = useRef(dragSnap);
  snapRef.current = dragSnap;

  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoExpandTargetRef = useRef<string | null>(null);
  const isDragging = dragSnap.phase === "dragging";

  const displayTree = useMemo(
    () => computeDragPreview(projects, groups, dragSnap),
    [projects, groups, dragSnap]
  );

  const itemMap = useMemo(
    () => new Map(displayTree.map((i) => [i.id, i])),
    [displayTree]
  );

  const listRef = useRef<HTMLDivElement>(null);
  useFlipAnimation(listRef, displayTree);

  const clearAutoExpandTimer = () => {
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
    autoExpandTargetRef.current = null;
  };

  const itemVisible = useMemo(() => {
    const map = new Map<string, boolean>();
    let skipGroup: string | null = null;
    for (const item of displayTree) {
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
    for (const item of displayTree) {
      if (item.type === "group-header" && !item.groupCollapsed && item.groupId) {
        emptyGroups.add(item.groupId);
      }
    }
    for (const item of displayTree) {
      if (item.type === "project" && item.project?.group_id && map.get(item.id)) {
        emptyGroups.delete(item.project.group_id);
      }
    }
    for (const gid of emptyGroups) {
      map.set(gid, false);
    }
    return map;
  }, [displayTree, filter]);

  const pointerSensor = useMemo(() => PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Delay({ value: 300, tolerance: 5 })],
  }), []);

  const updSnap = useCallback((patch: Partial<DragSnapshot>) => {
    setDragSnap((prev) => {
      const next = { ...prev, ...patch };
      const intent = resolveIntent(next);
      return intent !== prev.intent ? { ...next, intent } : next;
    });
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragStart = useCallback((e: any) => {
    const sourceId = e.operation?.source?.id;
    if (!sourceId) return;
    clearAutoExpandTimer();
    const item = itemMap.get(sourceId);
    const idx = displayTree.findIndex((it) => it.id === sourceId);
    const srcGroup = item?.type === "project" ? item.project?.group_id : item?.groupId;
    log.dragStart(sourceId, idx, srcGroup,
      displayTree.map((it) => ({ id: it.id, type: it.type, gid: it.project?.group_id ?? it.groupId ?? null }))
    );
    updSnap({
      phase: "dragging",
      sourceId,
      sourceItem: item ?? null,
      sourceIdx: idx,
      targetId: null,
      targetItem: null,
      targetIdx: -1,
      zone: null,
      ontoGroupId: null,
    });
  }, [displayTree, itemMap, updSnap]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragOver = useCallback((e: any) => {
    const target = e.operation?.target;
    let targetId: string | null = null;
    let targetEl: HTMLElement | null = null;

    if (target) {
      targetId = target.id as string;
      targetEl = (target as { element?: Element }).element as HTMLElement | null;
    } else if (e.operation?.position) {
      const resolved = resolveTargetFromPoint(e.operation.position.x, e.operation.position.y);
      if (resolved) { targetId = resolved.id; targetEl = resolved.element; }
    }

    if (!targetId || !targetEl) {
      clearAutoExpandTimer();
      updSnap({ targetId: null, targetItem: null, targetIdx: -1, zone: null, ontoGroupId: null });
      return;
    }

    const snap = snapRef.current;
    if (!snap.sourceId) return;

    const targetIdx = displayTree.findIndex((it) => it.id === targetId);
    if (targetIdx < 0) return;

    const targetItem = itemMap.get(targetId) ?? null;
    const rect = targetEl.getBoundingClientRect();
    const y = e.operation?.position?.y || 0;
    const zone = targetItem?.type === "group-slot"
      ? ("onto" as DragZone)
      : computeZone(y, rect, targetIdx, snap.sourceIdx);

    const ontoGroupId = deriveOntoGroupId(zone, targetItem);

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

    if (snap.targetId === targetId && snap.zone === zone && snap.ontoGroupId === ontoGroupId) return;

    updSnap({ targetId, targetItem, targetIdx, zone, ontoGroupId });
  }, [displayTree, itemMap, updSnap, toggleGroup]);

  const handleDragEnd = useCallback(() => {
    const snap = snapRef.current;
    clearAutoExpandTimer();

    if (snap.phase === "dragging" && snap.sourceId && snap.targetId && snap.zone) {
      const intent = snap.intent;
      executeIntent(
        intent,
        snap,
        displayTree,
        projects,
        groups,
        { reorderAll, batchMoveAndReorder, createGroup, toggleGroup, t }
      );
    }

    setDragSnap(createEmptySnapshot());
  }, [displayTree, projects, groups, reorderAll, batchMoveAndReorder, createGroup, toggleGroup, t]);

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

  const activeItem = isDragging && dragSnap.sourceId ? itemMap.get(dragSnap.sourceId) : null;

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
        <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0" }}>
          <div onClick={() => selectProject(null)}
            style={{ padding: "8px 14px", margin: "1px 4px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", opacity: 0.6 }}
            onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = "var(--color-hover)"; e.currentTarget.style.opacity = "0.8"; }}
            onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = "0.6"; }}>
            <Home size={16} strokeWidth={1.5} /><span style={{ color: "var(--color-text-secondary)" }}>{t.homeItem}</span>
          </div>
          {displayTree.map((item, idx) => (
            <SortableTreeItem key={item.id} id={item.id} index={idx} item={item}
              visible={itemVisible.get(item.id) !== false}
              activeId={dragSnap.sourceId}
              dragZone={dragSnap.zone} dragTargetId={dragSnap.targetId} ontoGroupId={dragSnap.ontoGroupId}
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
        {activeItem && <OverlayCard item={activeItem} ontoGroupId={dragSnap.ontoGroupId} dragZone={dragSnap.zone} groups={groups} projects={projects} itemMap={itemMap} dragTargetId={dragSnap.targetId} />}
      </DragOverlay>
    </DragDropProvider>
  );
}
