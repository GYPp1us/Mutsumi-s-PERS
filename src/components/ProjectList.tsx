import { useState, useEffect, useMemo } from "react";
import { useAppStore, buildTree, nextGroupColor } from "../lib/store";
import type { Project } from "../lib/tauri";
import { useT } from "../lib/i18n";
import { Home, Folder, Star, Plus, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { useSortable, isSortable } from "@dnd-kit/react/sortable";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";

type Zone = "above" | "onto" | "below" | null;
const ZONE_TOP = 0.25;
const ZONE_BOTTOM = 0.75;

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
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
  const [ontoGroupId, setOntoGroupId] = useState<string | null>(null);
  const isDragging = activeId !== null;

  const flatTree = useMemo(() => buildTree(projects, groups), [projects, groups]);

  const displayItems = useMemo(() => {
    const result: (typeof flatTree)[number][] = [];
    let skipGroup: string | null = null;
    for (const item of flatTree) {
      if (item.type === "group-header") {
        result.push(item);
        skipGroup = item.groupCollapsed ? item.groupId! : null;
      } else if (skipGroup && item.project?.group_id === skipGroup) {
        // collapsed group: skip
      } else if (filter && !item.project?.name.toLowerCase().includes(filter.toLowerCase())) {
        // filtered out
      } else {
        result.push(item);
      }
    }
    // Remove group-headers with no visible children
    return result.filter((item, idx, arr) => {
      if (item.type !== "group-header") return true;
      const next = arr.slice(idx + 1);
      const hasChild = next.some((n) => n.type === "project" && n.project?.group_id === item.groupId);
      return hasChild || arr.indexOf(arr.find((n) => n.id === item.id)!) === idx;
    }).filter((item, idx, arr) => {
      if (item.type !== "group-header") return true;
      const nextItems = arr.slice(idx + 1);
      const hasVisibleChildren = nextItems.some((n) => n.type === "project" && n.project?.group_id === item.groupId);
      return hasVisibleChildren;
    });
  }, [flatTree, filter]);

  const itemMap = useMemo(() => new Map(flatTree.map((i) => [i.id, i])), [flatTree]);

  const pointerSensor = useMemo(() => PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Delay({ value: 300, tolerance: 5 })],
  }), []);

  const getZone = (y: number, rect: DOMRect): Zone => {
    const r = (y - rect.top) / rect.height;
    if (r < ZONE_TOP) return "above"; if (r > ZONE_BOTTOM) return "below"; return "onto";
  };

  const getTargetGroupId = (id: string): string | null => {
    const item = itemMap.get(id);
    if (!item) return null;
    if (item.type === "group-header") return item.groupId || null;
    if (item.project?.group_id) return item.project.group_id;
    return null;
  };

  const handleDragStart = (e: any) => {
    setActiveId(e.operation?.source?.id || "");
    setDragZone(null);
    setOntoGroupId(null);
  };

  const handleDragOver = (e: any) => {
    const target = e.operation?.target;
    if (!target) return;
    const targetEl = (target as any)?.element as HTMLElement;
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const zone = getZone(e.operation.position.y, rect);
    setDragZone(zone);
    setOntoGroupId(zone === "onto" ? getTargetGroupId(target.id) : null);
  };

  const handleDragEnd = (e: any) => {
    const source = e.operation?.source;
    const target = e.operation?.target;
    const zone = dragZone;
    setActiveId(null); setDragZone(null); setOntoGroupId(null);

    if (!source || !target || !zone) return;
    const sourceItem = itemMap.get(source.id);
    if (!sourceItem) return;

    if (sourceItem.type === "project" && zone === "onto") {
      const projectIds = projects.map((p) => p.id);
      const tgid = getTargetGroupId(target.id as string);
      if (tgid) {
        const sp = projects.find((p) => p.id === source.id);
        if (sp?.group_id === tgid) return;
        const no = [...projectIds];
        const si = no.indexOf(source.id as string), ti = no.indexOf(target.id as string);
        if (si !== -1 && ti !== -1) { no.splice(si, 1); no.splice(ti, 0, source.id as string); }
        batchMoveAndReorder([{ projectId: source.id as string, groupId: tgid }], no);
      } else {
        const color = nextGroupColor(groups);
        createGroup(t.groupDefaultName(groups.length + 1), color).then((ngid) => {
          const no = [...projectIds];
          const si = no.indexOf(source.id as string), ti = no.indexOf(target.id as string);
          if (si !== -1 && ti !== -1) { no.splice(si, 1); no.splice(ti, 0, source.id as string); }
          batchMoveAndReorder([{ projectId: source.id as string, groupId: ngid }, { projectId: target.id as string, groupId: ngid }], no);
        }).catch(() => {});
      }
      return;
    }

    if (isSortable(source) && source.initialIndex !== source.index) {
      const reordered = arrayMove(displayItems, source.initialIndex, source.index);

      const fullProjectIds: string[] = [];
      const mapped = new Set<string>();
      for (const it of reordered) {
        if (it.type === "group-header" && it.groupId) {
          const gprojs = projects.filter((p) => p.group_id === it.groupId).map((p) => p.id);
          for (const pid of gprojs) { if (!mapped.has(pid)) { fullProjectIds.push(pid); mapped.add(pid); } }
        } else if (it.type === "project" && !mapped.has(it.id)) {
          fullProjectIds.push(it.id);
          mapped.add(it.id);
        }
      }
      for (const p of projects) { if (!mapped.has(p.id)) { fullProjectIds.push(p.id); mapped.add(p.id); } }

      const sourceGroupId = sourceItem.project?.group_id;
      if (zone !== "onto" && sourceGroupId) {
        batchMoveAndReorder([{ projectId: source.id as string, groupId: null }], fullProjectIds);
      } else {
        reorderAll(fullProjectIds);
      }
    }
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
          {displayItems.map((item: any, idx: number) => (
            <SortableTreeItem key={item.id} id={item.id} index={idx} item={item} activeId={activeId}
              dragZone={dragZone} ontoGroupId={ontoGroupId} savedSelected={savedSelected} filterActive={!!filter && !isDragging}
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

function SortableTreeItem({ id, index, item, activeId, dragZone, ontoGroupId, savedSelected, filterActive,
  editingGroupId, editName, setEditName, commitRename, handleGroupRename, toggleGroup, selectProject, projects }: any) {
  const { ref, handleRef, isDragSource } = useSortable({ id, index, disabled: filterActive });
  const isSource = activeId === id;

  if (item.type === "group-header") {
    const vc = (projects as Project[]).filter((p: Project) => p.group_id === item.groupId).length;
    const isOnto = ontoGroupId === item.groupId && dragZone === "onto" && activeId !== id;

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
  const isOnto = dragZone === "onto" && activeId !== id && ((ontoGroupId && ontoGroupId === p.group_id) || (!ontoGroupId && !p.group_id));
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
