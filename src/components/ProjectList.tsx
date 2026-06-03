import { useState, useEffect, useMemo } from "react";
import { useAppStore, buildTree, nextGroupColor } from "../lib/store";
import type { Project } from "../lib/tauri";
import type { TreeItem } from "../lib/store";
import { useT } from "../lib/i18n";
import { Home, Folder, Star, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { DragDropProvider, DragOverlay, useDraggable } from "@dnd-kit/react";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";

type Zone = "above" | "onto" | "below" | null;
const ZONE_TOP = 0.25;
const ZONE_BOTTOM = 0.75;

interface DragMeta {
  activeId: string | null;
  activeType: "project" | "group-header";
  zone: Zone;
  ontoGroupId: string | null;
  targetId: string | null; // current hovered target
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

  const [filter, setFilter] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dragMeta, setDragMeta] = useState<DragMeta>({ activeId: null, activeType: "project", zone: null, ontoGroupId: null, targetId: null });
  const [order, setOrder] = useState<string[]>([]);
  const isDragging = dragMeta.activeId !== null;

  const flatItems = useMemo(() => buildTree(projects, groups), [projects, groups]);
  const itemMap = useMemo(() => new Map(flatItems.map((i) => [i.id, i])), [flatItems]);

  useEffect(() => {
    loadProjects();
    loadGroups();
    loadSettings();
  }, []);

  useEffect(() => {
    if (!isDragging) {
      setOrder(flatItems.map((i) => i.id));
    }
  }, [flatItems, isDragging]);

  const filteredOrder = useMemo(() => {
    if (!filter || isDragging) return order;
    return order.filter((id) => {
      const item = itemMap.get(id);
      if (!item) return false;
      if (item.type === "group-header") {
        const gid = item.groupId;
        if (!gid) return false;
        return projects.some((p) => p.group_id === gid && p.name.toLowerCase().includes(filter.toLowerCase()));
      }
      return item.project?.name.toLowerCase().includes(filter.toLowerCase());
    });
  }, [order, filter, isDragging, itemMap, projects]);

  const filterActive = filter.length > 0 && !isDragging;

  const pointerSensor = PointerSensor.configure({
    activationConstraints: [
      new PointerActivationConstraints.Delay({ value: 300, tolerance: 5 }),
    ],
  });

  const getZone = (clientY: number, rect: DOMRect): Zone => {
    const ratio = (clientY - rect.top) / rect.height;
    if (ratio < ZONE_TOP) return "above";
    if (ratio > ZONE_BOTTOM) return "below";
    return "onto";
  };

  const swapOrder = (sourceId: string, targetId: string) => {
    const idx = [...order];
    const si = idx.indexOf(sourceId);
    const ti = idx.indexOf(targetId);
    if (si === -1 || ti === -1 || si === ti) return;
    idx.splice(si, 1);
    const newTi = idx.indexOf(targetId);
    idx.splice(newTi, 0, sourceId);
    setOrder(idx);
  };

  const moveGroupBlock = (groupHeaderId: string, targetId: string, zone: "above" | "below") => {
    const groupItem = itemMap.get(groupHeaderId);
    if (!groupItem?.groupId) return;
    const gid = groupItem.groupId;
    const groupIds = flatItems.filter((i) => i.isGrouped && i.project?.group_id === gid).map((i) => i.id);
    const allGroupIds = [groupHeaderId, ...groupIds];
    const otherIds = order.filter((id) => !allGroupIds.includes(id));
    const tIdx = otherIds.indexOf(targetId);
    if (tIdx === -1) return;
    const insertIdx = zone === "below" ? tIdx + 1 : tIdx;
    const newOrder = [...otherIds];
    newOrder.splice(insertIdx, 0, ...allGroupIds);
    setOrder(newOrder);
  };

  const handleDragStart = () => {
    setOrder(flatItems.map((i) => i.id));
  };

  const handleDragMove = (e: any) => {
    const operation = e.operation;
    const source = operation.source;
    const target = operation.target;
    if (!source || !target) return;

    const sourceItem = itemMap.get(source.id);
    if (!sourceItem) return;

    const targetEl = (target as any)?.element as HTMLElement | undefined;
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    const pointer = operation.position;
    const zone = getZone(pointer.y, rect);

    setDragMeta({
      activeId: source.id,
      activeType: sourceItem.type === "group-header" ? "group-header" : "project",
      zone,
      ontoGroupId: zone === "onto" ? getTargetGroupId(target.id) : null,
      targetId: target.id,
    });

    if (sourceItem.type === "group-header" && (zone === "above" || zone === "below") && source.id !== target.id) {
      moveGroupBlock(source.id, target.id, zone);
    } else if (source.id !== target.id && (zone === "above" || zone === "below")) {
      swapOrder(source.id, target.id);
    }
  };

  const getTargetGroupId = (targetId: string): string | null => {
    const item = itemMap.get(targetId);
    if (!item) return null;
    if (item.type === "project" && item.project) return item.project.group_id || null;
    if (item.type === "group-header") return item.groupId || null;
    return null;
  };

  const handleDragEnd = (e: any) => {
    const source = e.operation.source;
    const target = e.operation.target;
    const meta = dragMeta;
    setDragMeta({ activeId: null, activeType: "project", zone: null, ontoGroupId: null, targetId: null });

    if (!source || !target || !meta.zone) return;

    const sourceItem = itemMap.get(source.id);
    if (!sourceItem) return;

    const projectIds = projects.map((p) => p.id);
    const finalProjectIds = order
      .map((id) => {
        const item = itemMap.get(id);
        if (!item) return null;
        if (item.type === "project") return item.id;
        return null;
      })
      .filter(Boolean) as string[];

    if (sourceItem.type === "group-header" && (meta.zone === "above" || meta.zone === "below")) {
      reorderAll(finalProjectIds);
    } else if (sourceItem.type === "project" && meta.zone === "onto") {
      const targetGroupId = getTargetGroupId(target.id);
      if (targetGroupId) {
        const srcProj = projects.find((p) => p.id === source.id);
        if (srcProj?.group_id === targetGroupId) return;
        const newOrder = [...projectIds];
        const si = newOrder.indexOf(source.id);
        const ti = newOrder.indexOf(target.id);
        if (si !== -1 && ti !== -1) {
          newOrder.splice(si, 1);
          newOrder.splice(ti, 0, source.id);
        }
        batchMoveAndReorder([{ projectId: source.id, groupId: targetGroupId }], newOrder);
      } else {
        const color = nextGroupColor(groups);
        createGroup(t.groupDefaultName(groups.length + 1), color)
          .then((newGroupId) => {
            const newOrder = [...finalProjectIds];
            const si = newOrder.indexOf(source.id);
            const ti = newOrder.indexOf(target.id);
            if (si !== -1 && ti !== -1) {
              newOrder.splice(si, 1);
              newOrder.splice(ti, 0, source.id);
            }
            batchMoveAndReorder(
              [{ projectId: source.id, groupId: newGroupId }, { projectId: target.id, groupId: newGroupId }],
              newOrder,
            );
          })
          .catch(() => {});
      }
    } else if (sourceItem.type === "project" && (meta.zone === "above" || meta.zone === "below")) {
      const srcGroupId = projects.find((p) => p.id === source.id)?.group_id;
      if (srcGroupId) {
        batchMoveAndReorder([{ projectId: source.id, groupId: null }], finalProjectIds);
      } else {
        reorderAll(finalProjectIds);
      }
    }
  };

  const handleGroupRename = (groupId: string) => {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    setEditingGroupId(groupId);
    setEditName(g.name);
  };

  const commitRename = () => {
    if (editingGroupId && editName.trim()) {
      renameGroup(editingGroupId, editName.trim());
    }
    setEditingGroupId(null);
  };

  const handleAdd = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: t.selectFolderTitle });
      if (dir) {
        const name = dir.split(/[\\/]/).pop() || t.unnamed;
        await addProject(name, dir as string);
      }
    } catch (e) {
      console.error("Failed to add project:", e);
    }
  };

  return (
    <DragDropProvider
      plugins={[pointerSensor]}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <aside
        style={{
          width: 260, background: "var(--color-base)", display: "flex",
          flexDirection: "column", flexShrink: 0, borderRight: "1px solid var(--color-hover)",
          position: "relative",
        }}
      >
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>{t.projectListTitle}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={openCreateProject} title={t.newProject}
              style={{ background: "none", border: "none", color: "var(--color-primary-fg)", cursor: "pointer", lineHeight: 1, display: "flex" }}>
              <Plus size={18} strokeWidth={1.5} />
            </button>
            <button onClick={handleAdd} title="Browse folder"
              style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", lineHeight: 1 }}>
              <Plus size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <input type="text" placeholder={t.filterPlaceholder} value={filter} onChange={(e) => !isDragging && setFilter(e.target.value)}
          style={{ margin: "0 12px 8px", background: "var(--color-card)", color: "var(--color-text-secondary)", border: "none", padding: "7px 12px", fontSize: 12, outline: "none" }} />

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0", position: "relative" }}>
          <HomeItem t={t} onClick={() => selectProject(null)} />

          {(isDragging ? order : filteredOrder).map((id) => {
            const item = itemMap.get(id);
            if (!item) return null;
            if (item.type === "group-header") {
              return <SortableGroupHeader key={id} id={id} item={item} dragMeta={dragMeta}
                projects={projects} isDragging={isDragging} filterActive={filterActive}
                savedSelected={savedSelected} editingGroupId={editingGroupId} editName={editName}
                onEditName={setEditName} onCommitRename={commitRename}
                onRename={handleGroupRename} onToggle={toggleGroup}
                selectProject={selectProject} filter={filter} />;
            }
            return <SortableItem key={id} id={id} item={item} dragMeta={dragMeta}
              savedSelected={savedSelected} filterActive={filterActive} selectProject={selectProject} />;
          })}
        </div>

        <div style={{ padding: 8, borderTop: "1px solid var(--color-hover)", fontSize: 10, color: "var(--color-text-muted)", textAlign: "center" }}>
          {isDragging ? "Drop to reorder / group" : t.projectCount(projects.length)}
        </div>
      </aside>

      <DragOverlay dropAnimation={null}>
        {dragMeta.activeId && (
          <OverlayCard id={dragMeta.activeId} itemMap={itemMap} dragMeta={dragMeta} groups={groups} projects={projects} />
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}

/* ────── Sub-components ────── */

function HomeItem({ t, onClick }: { t: any; onClick: () => void }) {
  return (
    <div onClick={onClick}
      style={{ padding: "8px 14px", margin: "1px 4px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", opacity: 0.6 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-hover)"; e.currentTarget.style.opacity = "0.8"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = "0.6"; }}>
      <Home size={16} strokeWidth={1.5} />
      <span style={{ color: "var(--color-text-secondary)" }}>{t.homeItem}</span>
    </div>
  );
}

function SortableItem({ id, item, dragMeta, savedSelected, filterActive, selectProject }: {
  id: string; item: TreeItem; dragMeta: DragMeta;
  savedSelected: string | null; filterActive: boolean; selectProject: (id: string | null) => void;
}) {
  const { isDragSource, handleRef, ref } = useDraggable({ id, disabled: filterActive });
  const isOnto = dragMeta.activeId !== null && dragMeta.activeId !== id && dragMeta.targetId === id && dragMeta.zone === "onto";
  const isSource = dragMeta.activeId === id;
  const p = item.project!;

  return (
    <div key={id}
      ref={(el) => {
        ref(el);
        if (el) handleRef(el);
      }}
      data-drag-id={id}
      onClick={() => { if (!isDragSource) selectProject(p.id); }}
      style={{
        padding: "8px 14px", margin: "1px 4px",
        display: "flex", alignItems: "center", gap: 8,
        cursor: filterActive ? "pointer" : "grab",
        background: savedSelected === p.id ? "var(--color-hover)" : (isOnto ? "var(--color-card)" : "transparent"),
        borderLeft: savedSelected === p.id ? "2px solid var(--color-primary)" : "2px solid transparent",
        opacity: isSource ? 0 : 1,
        boxShadow: isOnto ? "inset 0 0 0 2px var(--color-primary)" : "none",
        userSelect: "none",
      }}
      onMouseEnter={(e) => { if (!isDragSource && savedSelected !== p.id) e.currentTarget.style.background = "var(--color-card)"; }}
      onMouseLeave={(e) => { if (!isDragSource && savedSelected !== p.id) e.currentTarget.style.background = "transparent"; }}
    >
      <Folder size={14} strokeWidth={1.5} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.name}
        </div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.path}
        </div>
      </div>
      {p.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
    </div>
  );
}

function SortableGroupHeader({ id, item, dragMeta, projects, isDragging, filterActive, savedSelected,
  editingGroupId, editName, onEditName, onCommitRename, onRename, onToggle, selectProject, filter }: any) {
  const { handleRef, ref } = useDraggable({ id, disabled: filterActive });
  const isOnto = dragMeta.activeId !== null && dragMeta.activeId !== id && dragMeta.ontoGroupId === item.groupId && dragMeta.zone === "onto";
  const isSource = dragMeta.activeId === id;
  const groupProjs = projects.filter((p: Project) => p.group_id === item.groupId);
  const visibleCount = filter.length > 0
    ? groupProjs.filter((p: Project) => p.name.toLowerCase().includes(filter.toLowerCase())).length
    : groupProjs.length;

  return (
    <div key={id}>
      <div
        ref={(el) => {
          ref(el);
          if (el) handleRef(el);
        }}
        data-drag-id={id}
        onClick={(e: any) => { e.stopPropagation(); onToggle(item.groupId!, !item.groupCollapsed); }}
        onDoubleClick={(e: any) => { e.stopPropagation(); onRename(item.groupId!); }}
        className="group-header"
        style={{
          opacity: isSource ? 0.4 : 1,
          background: isOnto ? "var(--color-card)" : "transparent",
          borderLeft: item.groupColor ? `3px solid ${item.groupColor}` : "3px solid transparent",
          cursor: filterActive ? "pointer" : "grab",
        }}
        onMouseEnter={(e: any) => { if (!isDragging) e.currentTarget.style.background = "var(--color-card)"; }}
        onMouseLeave={(e: any) => { if (!isDragging) e.currentTarget.style.background = isOnto ? "var(--color-card)" : "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
          {item.groupCollapsed ? <ChevronRight size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
          {editingGroupId === item.id ? (
            <input autoFocus className="group-header-rename-input" value={editName}
              onChange={(e: any) => onEditName(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e: any) => { if (e.key === "Enter") onCommitRename(); if (e.key === "Escape") onEditName(""); }}
              onClick={(e: any) => e.stopPropagation()} />
          ) : (
            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.groupName}
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: "var(--color-text-muted)", marginRight: 4 }}>
          {item.groupCollapsed ? `(${visibleCount})` : `${visibleCount}`}
        </span>
      </div>

      {!item.groupCollapsed && groupProjs.map((p: Project) => {
        const pid = p.id;
        const ispOnto = dragMeta.activeId !== null && dragMeta.activeId !== pid && dragMeta.zone === "onto" && dragMeta.ontoGroupId === item.groupId;
        const ispSource = dragMeta.activeId === pid;
        return (
          <div key={pid}
            data-drag-id={pid}
            onClick={() => { selectProject(pid); }}
            className="group-item"
            style={{
              opacity: ispSource ? 0 : 1,
              background: savedSelected === pid ? "var(--color-hover)" : (ispOnto ? "var(--color-card)" : "transparent"),
              borderLeft: savedSelected === pid ? "2px solid var(--color-primary)" : `3px solid ${item.groupColor || "transparent"}`,
              cursor: filterActive ? "pointer" : "grab",
              boxShadow: ispOnto ? `inset 0 0 0 2px ${item.groupColor}` : "none",
              paddingLeft: "18px",
              display: "flex",
              alignItems: "center",
              padding: "7px 14px 7px 18px",
              margin: "1px 4px",
              userSelect: "none",
            }}
            onMouseEnter={(e: any) => { if (!isDragging && savedSelected !== pid) e.currentTarget.style.background = "var(--color-card)"; }}
            onMouseLeave={(e: any) => { if (!isDragging && savedSelected !== pid) e.currentTarget.style.background = "transparent"; }}
          >
            <Folder size={14} strokeWidth={1.5} />
            <div style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
              <div style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                {p.name}
              </div>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.path}
              </div>
            </div>
            {p.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
          </div>
        );
      })}
    </div>
  );
}

function OverlayCard({ id, itemMap, dragMeta, groups, projects }: {
  id: string; itemMap: Map<string, TreeItem>; dragMeta: DragMeta;
  groups: any[]; projects: any[];
}) {
  const item = itemMap.get(id);
  if (!item) return null;

  const previewColor = dragMeta.ontoGroupId
    ? (groups.find((g: any) => g.id === dragMeta.ontoGroupId)?.color || "var(--color-primary)")
    : (dragMeta.zone === "onto" && dragMeta.activeType === "project" ? "var(--color-primary)" : undefined);

  return (
    <div style={{
      width: 220, background: "var(--color-panel)", padding: "8px 12px",
      display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-text)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    }}>
      {item.type === "group-header" ? (
        <>
          <div style={{ width: 3, height: 20, background: item.groupColor, flexShrink: 0 }} />
          <ChevronDown size={14} strokeWidth={1.5} />
          <span style={{ fontWeight: 600 }}>{item.groupName}</span>
          <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
            {projects.filter((x: any) => x.group_id === item.groupId).length}
          </span>
        </>
      ) : (
        <>
          {previewColor
            ? <div style={{ width: 3, height: 20, background: previewColor, flexShrink: 0 }} />
            : <Folder size={14} strokeWidth={1.5} />
          }
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {item.project?.name}
          </span>
          {item.project?.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
        </>
      )}
    </div>
  );
}
