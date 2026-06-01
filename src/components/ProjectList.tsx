import { useState, useRef, useCallback, useEffect } from "react";
import { useAppStore, buildTree, nextGroupColor } from "../lib/store";
import { useT } from "../lib/i18n";
import { Home, Folder, Star, Plus, ChevronDown, ChevronRight } from "lucide-react";

type Zone = "above" | "onto" | "below" | null;

interface DragState {
  active: boolean;
  sourceId: string;
  sourceType: "project" | "group-header";
  mouseY: number;
  targetId: string | null;
  targetZone: Zone;
  ontoGroupId: string | null;
}

const ZONE_TOP = 0.25;
const ZONE_BOTTOM = 0.75;

export function ProjectList() {
  const t = useT();
  const projects = useAppStore((s) => s.projects);
  const groups = useAppStore((s) => s.groups);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const selectProject = useAppStore((s) => s.selectProject);
  const addProject = useAppStore((s) => s.addProject);
  const openCreateProject = useAppStore((s) => s.openCreateProject);
  const reorderAll = useAppStore((s) => s.reorderAll);
  const createGroup = useAppStore((s) => s.createGroup);
  const renameGroup = useAppStore((s) => s.renameGroup);
  const toggleGroup = useAppStore((s) => s.toggleGroup);
  const moveToGroup = useAppStore((s) => s.moveToGroup);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const loadGroups = useAppStore((s) => s.loadGroups);
  const loadSettings = useAppStore((s) => s.loadSettings);

  const [filter, setFilter] = useState("");
  const [drag, setDrag] = useState<DragState>({ active: false, sourceId: "", sourceType: "project", mouseY: 0, targetId: null, targetZone: null, ontoGroupId: null });
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTarget = useRef<{ id: string; type: "project" | "group-header" } | null>(null);
  const frozenTree = useRef<string[]>([]);

  useEffect(() => {
    loadProjects();
    loadGroups();
    loadSettings();
  }, []);

  const tree = buildTree(projects, groups);
  const visibleTree = filter
    ? tree.filter((item) => {
        if (item.type === "group-header") return true;
        return item.project?.name.toLowerCase().includes(filter.toLowerCase());
      })
    : tree;

  const filterActive = filter.length > 0;

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

  const getZone = (clientY: number, rect: DOMRect): Zone => {
    const ratio = (clientY - rect.top) / rect.height;
    if (ratio < ZONE_TOP) return "above";
    if (ratio > ZONE_BOTTOM) return "below";
    return "onto";
  };

  const getSourceProject = (id: string) => projects.find((p) => p.id === id);
  const getSourceGroup = (id: string) => groups.find((g) => g.id === id);

  const findTargetByY = useCallback((clientY: number): { targetId: string; zone: Zone } | null => {
    const container = scrollRef.current;
    if (!container) return null;
    const items = container.querySelectorAll('[data-drag-target]');
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        const zone = getZone(clientY, rect);
        return { targetId: (item as HTMLElement).dataset.dragTarget!, zone };
      }
    }
    return null;
  }, []);

  const onMouseDown = (e: React.MouseEvent, id: string, type: "project" | "group-header") => {
    if (filterActive) return;
    if (e.button !== 0) return;
    pressTarget.current = { id, type };

    longPressTimer.current = setTimeout(() => {
      pressTarget.current = null;
      frozenTree.current = projects.map((p) => p.id);
      setDrag({
        active: true,
        sourceId: id,
        sourceType: type,
        mouseY: e.clientY,
        targetId: null,
        targetZone: null,
        ontoGroupId: null,
      });
    }, 300);
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current.active) return;

    const target = findTargetByY(e.clientY);
    const state = dragRef.current;
    const newState: Partial<DragState> = { mouseY: e.clientY };

    if (target) {
      newState.targetId = target.targetId;
      newState.targetZone = target.zone;

      if (target.zone === "onto" && state.sourceType === "project") {
        const targetItem = tree.find((t) => t.id === target.targetId);
        if (targetItem?.type === "project" && targetItem.project) {
          newState.ontoGroupId = targetItem.project.group_id || null;
        } else if (targetItem?.type === "group-header") {
          newState.ontoGroupId = targetItem.groupId || null;
        }
      } else {
        newState.ontoGroupId = null;
      }
    } else {
      newState.targetId = null;
      newState.targetZone = null;
      newState.ontoGroupId = null;
    }

    setDrag({ ...state, ...newState } as DragState);
  }, [tree, findTargetByY]);

  const onMouseUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pressTarget.current = null;

    const state = dragRef.current;
    if (!state.active) return;

    const { sourceId, sourceType, targetId, targetZone } = state;
    if (!targetId || !targetZone) {
      setDrag({ active: false, sourceId: "", sourceType: "project", mouseY: 0, targetId: null, targetZone: null, ontoGroupId: null });
      return;
    }

    const projectIds = projects.map((p) => p.id);

    if (sourceType === "group-header" && (targetZone === "above" || targetZone === "below")) {
      const sourceGroup = groups.find((g) => g.id === sourceId);
      if (!sourceGroup) { resetDrag(); return; }
      const groupProjectIds = projects.filter((p) => p.group_id === sourceId).map((p) => p.id);
      const otherIds = projectIds.filter((id) => !groupProjectIds.includes(id));
      const targetIdx = otherIds.indexOf(targetId);
      const insertIdx = targetZone === "below" ? targetIdx + 1 : targetIdx;
      const newIds = [...otherIds];
      newIds.splice(insertIdx, 0, ...groupProjectIds);
      reorderAll(newIds);
    } else if (sourceType === "project" && targetZone === "onto") {
      const targetItem = tree.find((t) => t.id === targetId);
      let targetGroupId: string | null = null;

      if (targetItem?.type === "project" && targetItem.project) {
        targetGroupId = targetItem.project.group_id || null;
      } else if (targetItem?.type === "group-header") {
        targetGroupId = targetItem.groupId || null;
      }

      if (targetGroupId) {
        const sourceProj = projects.find((p) => p.id === sourceId);
        if (sourceProj?.group_id === targetGroupId) { resetDrag(); return; }
        moveToGroup(sourceId, targetGroupId).then(() => {
          const newIds = [...projectIds];
          const si = newIds.indexOf(sourceId);
          const ti = newIds.indexOf(targetId);
          if (si !== -1 && ti !== -1) {
            newIds.splice(si, 1);
            newIds.splice(ti, 0, sourceId);
            reorderAll(newIds);
          }
        });
      } else {
        const color = nextGroupColor();
        createGroup(t.groupDefaultName(groups.length + 1), color).then((newGroupId) => {
          moveToGroup(sourceId, newGroupId).catch(() => {});
          moveToGroup(targetId, newGroupId).catch(() => {});
        });
      }
    } else if (sourceType === "project" && (targetZone === "above" || targetZone === "below")) {
      const sourceGroupId = projects.find((p) => p.id === sourceId)?.group_id;
      const targetIsGroupHeader = tree.find((t) => t.id === targetId)?.type === "group-header";

      if (targetIsGroupHeader) {
        const gid = groups.find((g) => g.id === targetId)?.id;
        if (!gid) { resetDrag(); return; }
        const groupProjectIds = projects.filter((p) => p.group_id === gid).map((p) => p.id);
        const otherIds = projectIds.filter((id) => !groupProjectIds.includes(id));
        const si = otherIds.indexOf(sourceId);
        if (si === -1) { resetDrag(); return; }
        otherIds.splice(si, 1);
        const gi = otherIds.indexOf(targetId);
        const insertIdx = targetZone === "below" ? gi + 1 : gi;
        otherIds.splice(insertIdx, 0, sourceId);
        reorderAll(otherIds);
        if (sourceGroupId) {
          moveToGroup(sourceId, null);
        }
      } else {
        const newIds = [...projectIds];
        const si = newIds.indexOf(sourceId);
        const ti = newIds.indexOf(targetId);
        if (si === -1 || ti === -1) { resetDrag(); return; }
        newIds.splice(si, 1);
        const newTi = newIds.indexOf(targetId);
        const insertIdx = targetZone === "below" ? newTi + 1 : newTi;
        newIds.splice(insertIdx, 0, sourceId);
        reorderAll(newIds);
        if (sourceGroupId) {
          moveToGroup(sourceId, null);
        }
      }
    }

    resetDrag();
  }, [projects, groups, tree, reorderAll, createGroup, moveToGroup, t]);

  function resetDrag() {
    setDrag({ active: false, sourceId: "", sourceType: "project", mouseY: 0, targetId: null, targetZone: null, ontoGroupId: null });
    frozenTree.current = [];
  }

  useEffect(() => {
    if (drag.active) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    }
  }, [drag.active, onMouseMove, onMouseUp]);

  useEffect(() => {
    if (!drag.active) {
      frozenTree.current = [];
    }
  }, [drag.active]);

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

  const floatingCardLeft = 72;

  return (
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

      <input type="text" placeholder={t.filterPlaceholder} value={filter} onChange={(e) => setFilter(e.target.value)}
        style={{ margin: "0 12px 8px", background: "var(--color-card)", color: "var(--color-text-secondary)", border: "none", padding: "7px 12px", fontSize: 12, outline: "none" }} />

      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0", position: "relative" }}>
        <div onClick={() => selectProject(null)}
          style={{ padding: "8px 14px", margin: "1px 4px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", opacity: 0.6 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-hover)"; e.currentTarget.style.opacity = "0.8"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = "0.6"; }}>
          <Home size={16} strokeWidth={1.5} />
          <span style={{ color: "var(--color-text-secondary)" }}>{t.homeItem}</span>
        </div>

        {visibleTree.map((item) => {
          if (item.type === "group-header") {
            const isDraggingGroup = drag.active && drag.sourceType === "group-header" && drag.sourceId === item.id;
            const isSourceCollapsed = item.groupCollapsed;
            const groupProjs = projects.filter((p) => p.group_id === item.groupId);
            const isOnto = drag.active && drag.targetId === item.id && drag.targetZone === "onto" && drag.sourceType === "project";

            return (
              <div key={item.id}>
                <div
                  data-drag-target={item.id}
                  onMouseDown={(e) => onMouseDown(e, item.id, "group-header")}
                  onClick={() => toggleGroup(item.groupId!, !item.groupCollapsed)}
                  onDoubleClick={(e) => { e.stopPropagation(); handleGroupRename(item.groupId!); }}
                  className="group-header"
                  style={{
                    opacity: isDraggingGroup ? 0.4 : 1,
                    background: isOnto ? "var(--color-card)" : "transparent",
                    borderLeft: item.groupColor ? `3px solid ${item.groupColor}` : "3px solid transparent",
                    cursor: filterActive ? "pointer" : "grab",
                  }}
                  onMouseEnter={(e) => { if (!drag.active) e.currentTarget.style.background = "var(--color-card)"; }}
                  onMouseLeave={(e) => { if (!drag.active) e.currentTarget.style.background = isOnto ? "var(--color-card)" : "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
                    {item.groupCollapsed ? <ChevronRight size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
                    {editingGroupId === item.id ? (
                      <input autoFocus className="group-header-rename-input" value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingGroupId(null); }}
                        onClick={(e) => e.stopPropagation()} />
                    ) : (
                      <span style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.groupName}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--color-text-muted)", marginRight: 4 }}>
                    {item.groupCollapsed ? `(${groupProjs.length})` : `${groupProjs.length}`}
                  </span>
                </div>

                {!item.groupCollapsed && groupProjs.map((p) => {
                  const isDragging = drag.active && drag.sourceId === p.id;
                  const isOntoThis = drag.active && drag.targetId === p.id && drag.targetZone === "onto";
                  return (
                    <div key={p.id}
                      data-drag-target={p.id}
                      onMouseDown={(e) => onMouseDown(e, p.id, "project")}
                      onClick={() => selectProject(p.id)}
                      className="group-item"
                      style={{
                        opacity: isDragging ? 0 : 1,
                        background: selectedProjectId === p.id ? "var(--color-hover)" : (isOntoThis ? "var(--color-card)" : "transparent"),
                        borderLeft: selectedProjectId === p.id ? "2px solid var(--color-primary)" : `3px solid ${item.groupColor || "transparent"}`,
                        cursor: filterActive ? "pointer" : "grab",
                        boxShadow: isOntoThis ? `inset 0 0 0 2px ${item.groupColor}` : "none",
                        paddingLeft: "18px",
                        display: "flex",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) => { if (!drag.active && selectedProjectId !== p.id) e.currentTarget.style.background = "var(--color-card)"; }}
                      onMouseLeave={(e) => { if (!drag.active && selectedProjectId !== p.id) e.currentTarget.style.background = "transparent"; }}
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

                {item.groupCollapsed && isSourceCollapsed && drag.active && drag.sourceType === "group-header" && drag.sourceId === item.id && (
                  groupProjs.map((p) => (
                    <div key={p.id} style={{ height: 0, overflow: "hidden" }} />
                  ))
                )}
              </div>
            );
          }

          const p = item.project!;
          const isDragging = drag.active && drag.sourceId === p.id;
          const isOntoThis = drag.active && drag.targetId === p.id && drag.targetZone === "onto";

          return (
            <div key={p.id}
              data-drag-target={p.id}
              onMouseDown={(e) => onMouseDown(e, p.id, "project")}
              onClick={() => selectProject(p.id)}
              style={{
                padding: "8px 14px", margin: "1px 4px",
                display: "flex", alignItems: "center", gap: 8,
                cursor: filterActive ? "pointer" : "grab",
                background: selectedProjectId === p.id ? "var(--color-hover)" : (isOntoThis ? "var(--color-card)" : "transparent"),
                borderLeft: selectedProjectId === p.id ? "2px solid var(--color-primary)" : "2px solid transparent",
                opacity: isDragging ? 0 : 1,
                boxShadow: isOntoThis ? "inset 0 0 0 2px var(--color-primary)" : "none",
                transition: "background 0.12s ease, box-shadow 0.12s ease",
                userSelect: "none",
              }}
              onMouseEnter={(e) => { if (!drag.active && selectedProjectId !== p.id) e.currentTarget.style.background = "var(--color-card)"; }}
              onMouseLeave={(e) => { if (!drag.active && selectedProjectId !== p.id) e.currentTarget.style.background = "transparent"; }}
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
        })}
      </div>

      <div style={{ padding: 8, borderTop: "1px solid var(--color-hover)", fontSize: 10, color: "var(--color-text-muted)", textAlign: "center" }}>
        {drag.active ? "Drop to reorder / group" : t.projectCount(projects.length)}
      </div>

      {drag.active && (() => {
        const sourceProject = getSourceProject(drag.sourceId);
        const sourceGroup = getSourceGroup(drag.sourceId);
        const previewColor = drag.ontoGroupId
          ? (groups.find((g) => g.id === drag.ontoGroupId)?.color || "var(--color-primary)")
          : (drag.targetZone === "onto" && drag.sourceType === "project"
            ? "var(--color-primary)"
            : undefined);

        return (
          <div className="floating-card" style={{
            left: floatingCardLeft,
            top: drag.mouseY - 22,
            width: 220,
            background: "var(--color-panel)",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--color-text)",
          }}>
            {drag.sourceType === "group-header" && sourceGroup ? (
              <>
                <div style={{ width: 3, height: 20, background: sourceGroup.color, flexShrink: 0 }} />
                <ChevronDown size={14} strokeWidth={1.5} />
                <span style={{ fontWeight: 600 }}>{sourceGroup.name}</span>
                <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                  {projects.filter((x) => x.group_id === sourceGroup.id).length}
                </span>
              </>
            ) : sourceProject ? (
              <>
                {previewColor ? (
                  <div style={{ width: 3, height: 20, background: previewColor, flexShrink: 0 }} />
                ) : (
                  <Folder size={14} strokeWidth={1.5} />
                )}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {sourceProject.name}
                </span>
                {sourceProject.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
              </>
            ) : null}
          </div>
        );
      })()}
    </aside>
  );
}
