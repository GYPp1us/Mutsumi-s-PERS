import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppStore } from "../lib/store";
import type { TreeItem } from "../lib/store";
import type { Project, GroupInfo } from "../lib/tauri";
import { useT } from "../lib/i18n";
import { log } from "../lib/draglog";
import { Home, Folder, Star, Plus, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";
import type { DragDropManager } from "@dnd-kit/dom";
import { Modifier } from "@dnd-kit/abstract";

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

const AUTO_EXPAND_DELAY = 400;

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

/* ─── SortableTreeItem ─── */

interface SortableTreeItemProps {
  id: string;
  index: number;
  item: TreeItem;
  visible: boolean;
  activeId: string | null;
  dragZone: DragZone;
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

  const disabled = !visible || filterActive;

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
        <GroupSlotItem isOnto={dragZone === "onto" && dragTargetId === id} />
      </div>
    );
  }

  if (item.type === "group-header") {
    const isOntoTarget = dragZone === "onto" && dragTargetId === id;
    const isInOntoGroup = !!ontoGroupId && item.groupId === ontoGroupId;
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
  const isOntoTarget = dragZone === "onto" && dragTargetId === id;
  const isInOntoGroup = !!ontoGroupId && (item.project?.group_id === ontoGroupId || (dragZone === "onto" && dragTargetId === id && !item.project?.group_id));
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
  dragZone: DragZone;
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
  dragZone: DragZone;
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

function GroupSlotItem({ isOnto }: { isOnto: boolean }) {
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
  dragZone: DragZone;
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
