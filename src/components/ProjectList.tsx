// ============================================================================
// src/components/ProjectList.tsx
//
//
// ============================================================================

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { log } from "../lib/draglog";
import { Home, Plus } from "lucide-react";

import {
  createEmptySnapshot,
  computeBottomDropPreview,
  computeDeterministicDragPreview,
  deriveOntoGroupId,
  resolveIntent,
  executeIntent,
  captureHeights,
  buildDeterministicRows,
  resolveTargetFromOffsetLayout,
  BOTTOM_DROP_ID,
  makeZoneTree,
} from "../lib/drag";
import type { DragSnapshot, HeightMap } from "../lib/drag";

import { SortableTreeItem } from "./SortableTreeItem";
import { OverlayCard } from "./OverlayCard";


const BOTTOM_DROP_HEIGHT = 56;

interface DragHandleState {
  sourceId: string | null;
  startX: number;
  startY: number;
  pointerId: number;
  active: boolean;
}

interface DragOverlayMetrics {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

// ============================================================================
// ============================================================================

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

  const handleRef = useRef<DragHandleState>({
    sourceId: null, startX: 0, startY: 0, pointerId: -1, active: false,
  });

  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null);
  const overlayMetricsRef = useRef<DragOverlayMetrics>({ offsetX: 0, offsetY: 0, width: 0, height: 0 });

  const heightMapRef = useRef<HeightMap>(new Map());
  const containerTopRef = useRef<number>(0);
  const contentOffsetTopRef = useRef<number>(0);

  const isDragging = dragSnap.phase === "dragging";

  const displayTree = useMemo(
    () => computeDeterministicDragPreview(projects, groups, dragSnap),
    [projects, groups, dragSnap]
  );
  const zoneTree = useMemo(
    () => makeZoneTree(projects, groups, dragSnap.sourceId),
    [projects, groups, dragSnap.sourceId]
  );
  const commitTree = useMemo(
    () => computeBottomDropPreview(projects, groups, dragSnap),
    [projects, groups, dragSnap]
  );
  const itemMap = useMemo(
    () => new Map(displayTree.map((i) => [i.id, i])),
    [displayTree]
  );

  const listRef = useRef<HTMLDivElement>(null);

  const itemVisible = useMemo(() => {
    const map = new Map<string, boolean>();
    let skipGroup: string | null = null;
    for (const item of displayTree) {
      if (item.type === "group-slot") { map.set(item.id, true); }
      else if (item.type === "group-header") { map.set(item.id, true); skipGroup = item.groupCollapsed ? item.groupId! : null; }
      else {
        const inCollapsed = !!skipGroup && item.project?.group_id === skipGroup;
        const filteredOut = !!filter && !item.project?.name.toLowerCase().includes(filter.toLowerCase());
        map.set(item.id, !inCollapsed && !filteredOut);
      }
    }
    const emptyGroups = new Set<string>();
    for (const item of displayTree) {
      if (item.type === "group-header" && !item.groupCollapsed && item.groupId) emptyGroups.add(item.groupId);
    }
    for (const item of displayTree) {
      if (item.type === "project" && item.project?.group_id && map.get(item.id)) emptyGroups.delete(item.project.group_id);
      if (item.type === "group-slot" && item.groupId && map.get(item.id)) emptyGroups.delete(item.groupId);
    }
    for (const gid of emptyGroups) map.set(gid, false);
    return map;
  }, [displayTree, filter]);

  useEffect(() => {
    if (!isDragging) return;
    const container = listRef.current;
    if (!container) return;
    const map = heightMapRef.current;
    let changed = false;
    for (const item of displayTree) {
      if (map.has(item.id)) continue;
      if (item.type === "group-slot") {
        map.set(item.id, 42);           // 40px + 2px margin (GroupSlotItem)
        changed = true;
      } else {
        const el = container.querySelector<HTMLElement>(`[data-dnd-item-id="${item.id}"]`);
        if (el) { map.set(item.id, el.getBoundingClientRect().height); changed = true; }
      }
    }
    if (changed) heightMapRef.current = new Map(map);
  }, [displayTree, isDragging]);
  const updSnap = useCallback((patch: Partial<DragSnapshot>) => {
    setDragSnap((prev) => {
      const next = { ...prev, ...patch };
      const intent = resolveIntent(next);
      return intent !== prev.intent ? { ...next, intent } : next;
    });
  }, []);

  // ========================================================================
  // ========================================================================
  const processDragFrame = useCallback((pointerY: number) => {
    const h = handleRef.current;
    if (!h.active || !h.sourceId) return;

    const ct = containerTopRef.current;
    const st = listRef.current?.scrollTop ?? 0;

    const previousSnap = snapRef.current;
    const previousTarget = previousSnap.targetId
      ? {
          targetId: previousSnap.targetId,
          targetIdx: previousSnap.targetIdx,
          targetItem: previousSnap.targetItem,
          zone: previousSnap.zone,
          kind: previousSnap.targetItem?.type ?? (previousSnap.targetId === BOTTOM_DROP_ID ? "bottom-drop" as const : "project" as const),
        }
      : null;
    const resolved = resolveTargetFromOffsetLayout({
      tree: zoneTree,
      measuredHeights: heightMapRef.current,
      pointerY,
      containerTop: ct,
      scrollTop: st,
      sourceId: h.sourceId,
      containerHeight: listRef.current?.clientHeight ?? 0,
      contentOffsetTop: contentOffsetTopRef.current,
      previous: previousTarget,
    });

    if (!resolved) {
      updSnap({ targetId: null, targetItem: null, targetIdx: -1, zone: null, ontoGroupId: null });
      return;
    }

    const { targetId, targetIdx, zone } = resolved;
    const targetItem = resolved.targetItem ?? zoneTree.find((item) => item.id === targetId) ?? null;
    const snap = snapRef.current;
    const srcGroupId = snap.sourceItem?.project?.group_id ?? snap.sourceItem?.groupId ?? null;
    const ontoGroupId = deriveOntoGroupId(zone, targetItem, srcGroupId);

    if (snap.targetId === targetId && snap.zone === zone && snap.ontoGroupId === ontoGroupId) return;

    updSnap({ targetId, targetItem, targetIdx, zone, ontoGroupId });
  }, [updSnap, zoneTree]);

  // ========================================================================
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const grip = (e.target as HTMLElement).closest("[data-drag-handle]");
    if (!grip) return;
    e.preventDefault();
    e.stopPropagation();

    const itemEl = (e.target as HTMLElement).closest("[data-dnd-item-id]") as HTMLElement | null;
    const itemId = itemEl?.getAttribute("data-dnd-item-id");
    if (!itemEl || !itemId) return;

    if (!!filter) return;

    const h = handleRef.current;
    h.sourceId = itemId;
    h.startX = e.clientX;
    h.startY = e.clientY;
    h.pointerId = e.pointerId;
    h.active = true;
    document.body.classList.add("dragging-active");

    const rect = itemEl.getBoundingClientRect();
    overlayMetricsRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };

    if (listRef.current) {
      heightMapRef.current = captureHeights(listRef.current);
      containerTopRef.current = listRef.current.getBoundingClientRect().top;
      const sourceIdx = zoneTree.findIndex((item) => item.id === itemId);
      const sourceRows = buildDeterministicRows({
        tree: zoneTree,
        measuredHeights: heightMapRef.current,
        containerHeight: listRef.current.clientHeight,
      });
      const sourceRowTop = sourceRows.find((row) => row.id === itemId)?.top ?? 0;
      const sourceContentTop = rect.top - containerTopRef.current + listRef.current.scrollTop;
      contentOffsetTopRef.current = sourceIdx >= 0 ? sourceContentTop - sourceRowTop : 0;
      const src = projects.find((p) => p.id === itemId);
      if (src?.group_id) {
        const g = groups.find((grp) => grp.id === src.group_id);
        if (g && !g.collapsed) {
          heightMapRef.current.set(`slot-${src.group_id}`, 42);
        }
      }
    }

    const item = itemMap.get(itemId);
    const idx = displayTree.findIndex((it) => it.id === itemId);
    log.dragStart(itemId, idx,
      item?.type === "project" ? item.project?.group_id : item?.groupId,
      displayTree.map((it) => ({ id: it.id, type: it.type, gid: it.project?.group_id ?? it.groupId ?? null }))
    );

    updSnap({
      phase: "dragging", sourceId: itemId,
      sourceItem: item ?? null, sourceIdx: idx,
      targetId: null, targetItem: null, targetIdx: -1, zone: null, ontoGroupId: null,
    });

    setOverlayPos({
      x: e.clientX - overlayMetricsRef.current.offsetX,
      y: e.clientY - overlayMetricsRef.current.offsetY,
    });

    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  }, [filter, itemMap, displayTree, projects, groups, zoneTree, updSnap]);

  // ========================================================================
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const h = handleRef.current;

      if (!h.active) return;

      setOverlayPos({
        x: e.clientX - overlayMetricsRef.current.offsetX,
        y: e.clientY - overlayMetricsRef.current.offsetY,
      });
      processDragFrame(e.clientY);
    };

    const onUp = () => {
      const h = handleRef.current;

      if (!h.active) {
        h.sourceId = null;
        return;
      }

      const snap = snapRef.current;
      if (snap.phase === "dragging" && snap.sourceId && snap.targetId && snap.zone) {
        if (snap.targetId === BOTTOM_DROP_ID) {
          const order = commitTree.filter((item) => item.type === "project").map((item) => item.id);
          if (snap.sourceItem?.type === "project") {
            batchMoveAndReorder([{ projectId: snap.sourceId, groupId: null }], order);
          } else {
            reorderAll(order);
          }
        } else {
          executeIntent(snap.intent, snap, commitTree, projects, groups, {
            reorderAll, batchMoveAndReorder, createGroup, toggleGroup, t,
          });
          const groupToOpen = snap.ontoGroupId ?? snap.targetItem?.groupId ?? snap.targetItem?.project?.group_id ?? null;
          if (groupToOpen) {
            const group = groups.find((g) => g.id === groupToOpen);
            if (group?.collapsed) toggleGroup(groupToOpen, false);
          }
        }
      }

      h.active = false;
      h.sourceId = null;
      h.pointerId = -1;
      document.body.classList.remove("dragging-active");
      setOverlayPos(null);
      setDragSnap(createEmptySnapshot());
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("dragging-active");
    };
  }, [displayTree, commitTree, projects, groups, processDragFrame, reorderAll, batchMoveAndReorder, createGroup, toggleGroup, t]);

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

  // ========================================================================
  // ========================================================================
  return (
    <>
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

        <div ref={listRef} onPointerDown={handlePointerDown}
          style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0", touchAction: "none" }}>
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
              projects={projects} groups={groups} />
          ))}
          {isDragging && (
            <div
              data-dnd-item-id={BOTTOM_DROP_ID}
              style={{
                height: BOTTOM_DROP_HEIGHT,
                margin: "1px 8px",
                border: "1px dashed transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                opacity: 0.25,
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        <div style={{ padding: 8, borderTop: "1px solid var(--color-hover)", fontSize: 10, color: "var(--color-text-muted)", textAlign: "center" }}>
          {isDragging ? t.dragFooterHint : t.projectCount(projects.length)}
        </div>
      </aside>

      {overlayPos !== null && activeItem && (
        <div style={{
          position: "fixed", left: overlayPos.x, top: overlayPos.y,
          width: overlayMetricsRef.current.width || 220,
          height: overlayMetricsRef.current.height || undefined,
          zIndex: 9999, pointerEvents: "none",
        }}>
          <OverlayCard item={activeItem} ontoGroupId={dragSnap.ontoGroupId} dragZone={dragSnap.zone}
            groups={groups} projects={projects} itemMap={itemMap} dragTargetId={dragSnap.targetId} />
        </div>
      )}
    </>
  );
}
