import { useState, useEffect, useMemo, useRef } from "react";
import { useAppStore, buildTree, nextGroupColor } from "../lib/store";
import type { Project } from "../lib/tauri";
import { useT } from "../lib/i18n";
import { Home, Folder, Star, Plus, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { useSortable, isSortable } from "@dnd-kit/react/sortable";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";
import { OptimisticSortingPlugin } from "@dnd-kit/dom/sortable";
import { Modifier } from "@dnd-kit/abstract";
import type { DragDropManager } from "@dnd-kit/dom";

type SwapResult = "before" | "onto" | "after" | null;
const SWAP_THRESHOLD = 0.25;

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
  const [dragZone, setDragZone] = useState<SwapResult>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [ontoGroupId, setOntoGroupId] = useState<string | null>(null);
  const dragStateRef = useRef<{ zone: SwapResult; ontoGroupId: string | null; targetId: string | null }>({ zone: null, ontoGroupId: null, targetId: null });
  const sourceTopRef = useRef<number>(0);
  const isDragging = activeId !== null;

  const flatTree = useMemo(() => buildTree(projects, groups), [projects, groups]);
  const itemMap = useMemo(() => new Map(flatTree.map((i) => [i.id, i])), [flatTree]);

  const itemVisible = useMemo(() => {
    const map = new Map<string, boolean>();
    let skipGroup: string | null = null;
    for (const item of flatTree) {
      if (item.type === "group-header") {
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

  const getSwapDirection = (y: number, rect: DOMRect): SwapResult => {
    const ratio = (y - rect.top) / rect.height;
    const fromAbove = sourceTopRef.current <= rect.top;
    if (fromAbove) {
      if (ratio > 1 - SWAP_THRESHOLD) return "after";
      return "onto";
    }
    if (ratio < SWAP_THRESHOLD) return "before";
    return "onto";
  };

  const getTargetGroupId = (id: string): string | null => {
    const item = itemMap.get(id);
    if (!item) return null;
    if (item.type === "group-header") return item.groupId || null;
    if (item.project?.group_id) return item.project.group_id;
    return null;
  };

  const findEnclosingGroup = (items: typeof flatTree, fromIndex: number): string | null => {
    for (let i = fromIndex - 1; i >= 0; i--) {
      if (items[i].type === "group-header") return items[i].groupId!;
    }
    return null;
  };

  const handleDragStart = (e: any) => {
    const sourceId = e.operation?.source?.id || "";
    setActiveId(sourceId);
    setDragZone(null);
    setDragTargetId(null);
    setOntoGroupId(null);
    dragStateRef.current = { zone: null, ontoGroupId: null, targetId: null };
    const sourceEl = (e.operation?.source as any)?.element as HTMLElement;
    sourceTopRef.current = sourceEl ? sourceEl.getBoundingClientRect().top : 0;
  };

  const handleDragOver = (e: any) => {
    const target = e.operation?.target;
    if (!target) return;
    const targetEl = (target as any)?.element as HTMLElement;
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const zone = getSwapDirection(e.operation.position.y, rect);
    const tgid = zone === "onto" ? getTargetGroupId(target.id) : null;
    dragStateRef.current = { zone, ontoGroupId: tgid, targetId: target.id as string };
    setDragZone(zone);
    setDragTargetId(target.id as string);
    setOntoGroupId(tgid);
  };

  const handleDragEnd = (e: any) => {
    const source = e.operation?.source;
    const target = e.operation?.target;
    const { zone } = dragStateRef.current;
    setActiveId(null); setDragZone(null); setDragTargetId(null); setOntoGroupId(null);
    dragStateRef.current = { zone: null, ontoGroupId: null, targetId: null };

    if (!source || !target || !zone) return;
    if (source.id === target.id) return;

    const sourceItem = itemMap.get(source.id);
    const targetItem = itemMap.get(target.id);
    if (!sourceItem || !targetItem) return;

    const sourceFlatIdx = flatTree.findIndex((it) => it.id === (source.id as string));
    const targetFlatIdx = flatTree.findIndex((it) => it.id === (target.id as string));
    if (sourceFlatIdx === -1 || targetFlatIdx === -1) return;

    if (sourceItem.type === "project" && zone === "onto") {
      const projectIds = projects.map((p) => p.id);
      const tgGid = getTargetGroupId(target.id as string);

      if (tgGid) {
        const sp = projects.find((p) => p.id === source.id);
        if (sp?.group_id === tgGid) return;
        const targetGroup = groups.find((g) => g.id === tgGid);
        if (targetGroup?.collapsed) {
          toggleGroup(tgGid, false);
        }
        const no = [...projectIds];
        const si = no.indexOf(source.id as string), ti = no.indexOf(target.id as string);
        if (si !== -1 && ti !== -1) { no.splice(si, 1); no.splice(ti, 0, source.id as string); }
        batchMoveAndReorder([{ projectId: source.id as string, groupId: tgGid }], no);
      } else {
        const color = nextGroupColor(groups);
        createGroup(t.groupDefaultName(groups.length + 1), color).then((ngid) => {
          const no = [...projectIds];
          const si = no.indexOf(source.id as string), ti = no.indexOf(target.id as string);
          if (si !== -1 && ti !== -1) { no.splice(si, 1); no.splice(ti, 0, source.id as string); }
          batchMoveAndReorder([
            { projectId: source.id as string, groupId: ngid },
            { projectId: target.id as string, groupId: ngid }
          ], no);
        }).catch(() => {});
      }
      return;
    }

    if (!isSortable(source)) return;

    const insertAt = zone === "before"
      ? targetFlatIdx
      : targetFlatIdx + 1;
    const to = insertAt > sourceFlatIdx ? insertAt - 1 : insertAt;
    let reordered = arrayMove(flatTree, sourceFlatIdx, Math.max(0, Math.min(to, flatTree.length - 1)));

    const sourceDisplayItem = reordered.find((it) => it.id === (source.id as string)) || sourceItem;
    const sourceType = sourceDisplayItem?.type || sourceItem.type;
    const sourceProj = sourceDisplayItem?.project || sourceItem.project;

    if (sourceType === "group-header") {
      const gid = sourceDisplayItem?.groupId || sourceItem.groupId;
      if (gid) {
        const groupProjIds = new Set(projects.filter((p) => p.group_id === gid).map((p) => p.id));
        const withoutProjects = reordered.filter((it) => it.type !== "project" || !groupProjIds.has(it.id));
        const headerIdx = withoutProjects.findIndex((it) => it.id === (source.id as string));
        const groupProjects = reordered.filter((it) => it.type === "project" && groupProjIds.has(it.id));
        if (headerIdx !== -1) {
          withoutProjects.splice(headerIdx + 1, 0, ...groupProjects);
          reordered = withoutProjects;
        }
      }
    }

    const fullProjectIds: string[] = [];
    const mapped = new Set<string>();
    for (const it of reordered) {
      if (it.type === "project" && !mapped.has(it.id)) {
        fullProjectIds.push(it.id);
        mapped.add(it.id);
      } else if (it.type === "group-header" && it.groupCollapsed && it.groupId) {
        const gprojs = projects.filter((p) => p.group_id === it.groupId).map((p) => p.id);
        for (const pid of gprojs) { if (!mapped.has(pid)) { fullProjectIds.push(pid); mapped.add(pid); } }
      }
    }
    for (const p of projects) { if (!mapped.has(p.id)) { fullProjectIds.push(p.id); mapped.add(p.id); } }

    const sourceGroupId = sourceProj?.group_id;
    if (sourceType === "project" && sourceGroupId) {
      const newIdx = reordered.findIndex((it) => it.id === (source.id as string));
      const enclosing = findEnclosingGroup(reordered, newIdx);
      if (enclosing !== sourceGroupId) {
        batchMoveAndReorder([{ projectId: source.id as string, groupId: null }], fullProjectIds);
        return;
      }
    }

    reorderAll(fullProjectIds);
  };

  const handleGroupRename = (gid: string) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    setEditingGroupId(gid); setEditName(g.name);
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
    <DragDropProvider plugins={(defaults) => [...defaults, pointerSensor]} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
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
          {flatTree.map((item: any, idx: number) => (
            <SortableTreeItem key={item.id} id={item.id} index={idx} item={item}
              visible={itemVisible.get(item.id) !== false}
              activeId={activeId}
              dragZone={dragZone} dragTargetId={dragTargetId}
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
      <DragOverlay dropAnimation={null}>
        {activeItem && <OverlayCard item={activeItem} ontoGroupId={ontoGroupId} dragZone={dragZone} groups={groups} projects={projects} />}
      </DragOverlay>
    </DragDropProvider>
  );
}

/* ─── SortableTreeItem ─── */

function SortableTreeItem({ id, index, item, visible, activeId, dragZone, dragTargetId, savedSelected, filterActive,
  editingGroupId, editName, setEditName, commitRename, handleGroupRename, toggleGroup, selectProject, projects }: any) {
  const { ref, handleRef, isDragSource } = useSortable({
    id, index,
    disabled: filterActive || !visible,
    modifiers: [RestrictToVertical],
    plugins: (defaults: any) => defaults.filter((p: any) => !(p instanceof OptimisticSortingPlugin)),
  });
  const isSource = activeId === id;

  if (!visible) {
    return (
      <div ref={ref} style={{ visibility: "hidden", height: 0, overflow: "hidden", margin: 0, padding: 0, border: "none", pointerEvents: "none" }}>
        <span ref={handleRef} />
      </div>
    );
  }

  if (item.type === "group-header") {
    const vc = (projects as Project[]).filter((p: Project) => p.group_id === item.groupId).length;
    const isOnto = dragZone === "onto" && dragTargetId === id;

    return (
      <div ref={ref}
        style={{ margin: "1px 4px", display: "flex", alignItems: "center", background: isOnto ? "var(--color-card)" : "transparent", opacity: isSource ? 0.4 : 1, borderLeft: item.groupColor ? `3px solid ${item.groupColor}` : "3px solid transparent" }}>
        <span ref={handleRef} style={{ cursor: "grab", padding: "6px 4px", display: "flex", color: "var(--color-text-muted)", opacity: 0.6 }}>
          <GripVertical size={14} strokeWidth={1.5} />
        </span>
        <div onClick={(e: any) => { e.stopPropagation(); if (!isDragSource) toggleGroup(item.groupId!, !item.groupCollapsed); }}
          onDoubleClick={(e: any) => { e.stopPropagation(); handleGroupRename(item.groupId!); }}
          style={{ flex: 1, display: "flex", alignItems: "center", padding: "6px 8px 6px 0", cursor: "pointer", gap: 4, minWidth: 0 }}>
          {item.groupCollapsed ? <ChevronRight size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
          {editingGroupId === item.id ? (
            <input autoFocus value={editName} onChange={(e: any) => setEditName(e.target.value)}
              onBlur={commitRename} onKeyDown={(e: any) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditName(""); }}
              onClick={(e: any) => e.stopPropagation()} style={{ background: "var(--color-hover)", color: "var(--color-text)", border: "none", padding: "2px 6px", fontSize: 13, fontWeight: 600, outline: "none", fontFamily: "inherit", width: 120 }} />
          ) : (
            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.groupName}</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: "var(--color-text-muted)", marginRight: 8 }}>{item.groupCollapsed ? `(${vc})` : `${vc}`}</span>
      </div>
    );
  }

  const p: Project = item.project!;
  const isGrouped = item.isGrouped;
  const groupColor = item.groupColor;
  const isOnto = dragZone === "onto" && dragTargetId === id;
  const sel = savedSelected === id;

  return (
    <div ref={ref}
      style={{
        padding: isGrouped ? "7px 14px 7px 18px" : "8px 14px", margin: "1px 4px",
        display: "flex", alignItems: "center", gap: 4,
        cursor: filterActive ? "pointer" : "default",
        background: sel ? "var(--color-hover)" : (isOnto ? "var(--color-card)" : "transparent"),
        borderLeft: sel ? "2px solid var(--color-primary)" : (isGrouped ? `3px solid ${groupColor || "transparent"}` : "2px solid transparent"),
        opacity: isSource ? 0 : 1,
        boxShadow: isOnto ? `inset 0 0 0 2px ${isGrouped ? groupColor : "var(--color-primary)"}` : "none",
        userSelect: "none",
      }}
      onMouseEnter={(e: any) => { if (sel !== true) e.currentTarget.style.background = "var(--color-card)"; }}
      onMouseLeave={(e: any) => { if (sel !== true) e.currentTarget.style.background = "transparent"; }}
    >
      <span ref={handleRef} style={{ cursor: "grab", display: "flex", color: "var(--color-text-muted)", opacity: 0.5 }}>
        <GripVertical size={14} strokeWidth={1.5} />
      </span>
      <div onClick={() => { if (!isDragSource) selectProject(id); }} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <Folder size={14} strokeWidth={1.5} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{p.name}</div>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.path}</div>
        </div>
        {p.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
      </div>
    </div>
  );
}

function OverlayCard({ item, ontoGroupId, dragZone, groups, projects }: any) {
  if (!item) return null;
  const previewColor = ontoGroupId ? (groups.find((g: any) => g.id === ontoGroupId)?.color || "var(--color-primary)") : (dragZone === "onto" ? "var(--color-primary)" : undefined);
  return (
    <div style={{ width: 220, background: "var(--color-panel)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-text)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
      {item.type === "group-header" ? (
        <>
          <div style={{ width: 3, height: 20, background: item.groupColor, flexShrink: 0 }} />
          <ChevronDown size={14} strokeWidth={1.5} />
          <span style={{ fontWeight: 600 }}>{item.groupName}</span>
          <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{projects.filter((x: any) => x.group_id === item.groupId).length}</span>
        </>
      ) : (
        <>
          {previewColor ? <div style={{ width: 3, height: 20, background: previewColor, flexShrink: 0 }} /> : <Folder size={14} strokeWidth={1.5} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.project?.name}</span>
          {item.project?.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
        </>
      )}
    </div>
  );
}
