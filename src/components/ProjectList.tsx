import { useState, useRef } from "react";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { Home, Folder, Star, Plus } from "lucide-react";

export function ProjectList() {
  const t = useT();
  const projects = useAppStore((s) => s.projects);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const selectProject = useAppStore((s) => s.selectProject);
  const addProject = useAppStore((s) => s.addProject);
  const openCreateProject = useAppStore((s) => s.openCreateProject);
  const reorderProjects = useAppStore((s) => s.reorderProjects);
  const [filter, setFilter] = useState("");
  const dragId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const filteredList = filter
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(filter.toLowerCase())
      )
    : projects;

  const filterActive = filter.length > 0;

  const handleAdd = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({
        directory: true,
        multiple: false,
        title: t.selectFolderTitle,
      });
      if (dir) {
        const name = dir.split(/[\\/]/).pop() || t.unnamed;
        await addProject(name, dir as string);
      }
    } catch (e) {
      console.error("Failed to add project:", e);
    }
  };

  const onDragStart = (id: string) => {
    dragId.current = id;
    setDragActive(true);
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragOverId.current = id;
  };

  const onDragEnd = () => {
    if (dragId.current && dragOverId.current && dragId.current !== dragOverId.current) {
      const ids = projects.map((p) => p.id);
      const fromIdx = ids.indexOf(dragId.current);
      const toIdx = ids.indexOf(dragOverId.current);
      if (fromIdx !== -1 && toIdx !== -1) {
        const newIds = [...ids];
        newIds.splice(fromIdx, 1);
        newIds.splice(toIdx, 0, dragId.current);
        reorderProjects(newIds);
      }
    }
    dragId.current = null;
    dragOverId.current = null;
    setDragActive(false);
  };

  return (
    <aside
      style={{
        width: 260,
        background: "var(--color-base)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        borderRight: "1px solid var(--color-hover)",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
          {t.projectListTitle}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={openCreateProject}
            title={t.newProject}
            style={{
              background: "none", border: "none",
              color: "var(--color-primary-fg)", cursor: "pointer", lineHeight: 1,
              transition: "all 0.15s ease", display: "flex",
            }}
          >
            <Plus size={18} strokeWidth={1.5} />
          </button>
          <button
            onClick={handleAdd}
            title="Browse folder"
            style={{
              background: "none", border: "none",
              color: "var(--color-text-muted)", cursor: "pointer", lineHeight: 1,
              transition: "all 0.15s ease",
            }}
          >
            <Plus size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder={t.filterPlaceholder}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          margin: "0 12px 8px", background: "var(--color-card)",
          color: "var(--color-text-secondary)", border: "none",
          padding: "7px 12px", fontSize: 12, outline: "none",
        }}
      />

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0" }}>
        <div
          onClick={() => selectProject(null)}
          style={{
            padding: "8px 14px", margin: "1px 4px",
            display: "flex", alignItems: "center", gap: 8,
            cursor: "pointer", opacity: 0.6, background: "transparent",
            transition: "background 0.12s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-hover)";
            e.currentTarget.style.opacity = "0.8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.opacity = "0.6";
          }}
        >
          <Home size={16} strokeWidth={1.5} />
          <span style={{ color: "var(--color-text-secondary)" }}>{t.homeItem}</span>
        </div>

        {filteredList.map((project) => (
          <div
            key={project.id}
            onClick={() => selectProject(project.id)}
            draggable={!filterActive}
            onDragStart={() => { if (!filterActive) onDragStart(project.id); }}
            onDragOver={(e) => { if (!filterActive) onDragOver(e, project.id); }}
            onDragEnd={() => { if (!filterActive) onDragEnd(); }}
            style={{
              padding: "8px 14px", margin: "1px 4px",
              display: "flex", alignItems: "center", gap: 8,
              cursor: filterActive ? "pointer" : "grab",
              background:
                selectedProjectId === project.id ? "var(--color-hover)" : "transparent",
              borderLeft: selectedProjectId === project.id
                ? "2px solid var(--color-primary)" : "2px solid transparent",
              borderTop: dragActive && dragOverId.current === project.id
                ? "1px solid var(--color-primary)" : "1px solid transparent",
              transition: "background 0.12s ease, border-color 0.12s ease",
              userSelect: "none",
            }}
            onMouseEnter={(e) => {
              if (selectedProjectId !== project.id) {
                e.currentTarget.style.background = "var(--color-card)";
              }
            }}
            onMouseLeave={(e) => {
              if (selectedProjectId !== project.id) {
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            <Folder size={14} strokeWidth={1.5} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                color: "var(--color-text)", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {project.name}
              </div>
              <div style={{
                fontSize: 10, color: "var(--color-text-muted)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {project.path}
              </div>
            </div>
            {project.starred && (
              <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />
            )}
          </div>
        ))}
      </div>

      <div style={{
        padding: 8, borderTop: "1px solid var(--color-hover)",
        fontSize: 10, color: "var(--color-text-muted)", textAlign: "center",
      }}>
        {dragActive && !filterActive
          ? "Drop to reorder"
          : t.projectCount(projects.length)}
      </div>
    </aside>
  );
}
