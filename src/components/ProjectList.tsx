import { useState } from "react";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";

export function ProjectList() {
  const t = useT();
  const projects = useAppStore((s) => s.projects);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const selectProject = useAppStore((s) => s.selectProject);
  const addProject = useAppStore((s) => s.addProject);
  const [filter, setFilter] = useState("");

  const filteredList = filter
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(filter.toLowerCase())
      )
    : projects;

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
        <button
          onClick={handleAdd}
          style={{
            background: "none", border: "none",
            color: "var(--color-text-muted)", fontSize: 18,
            cursor: "pointer", lineHeight: 1, transition: "all 0.15s ease",
          }}
        >
          +
        </button>
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
        >
          <span>&#8962;</span>
          <span style={{ color: "var(--color-text-secondary)" }}>{t.homeItem}</span>
        </div>

        {filteredList.map((project) => (
          <div
            key={project.id}
            onClick={() => selectProject(project.id)}
            style={{
              padding: "8px 14px", margin: "1px 4px",
              display: "flex", alignItems: "center", gap: 8,
              cursor: "pointer",
              background:
                selectedProjectId === project.id ? "var(--color-hover)" : "transparent",
              transition: "background 0.12s ease",
            }}
          >
            <span style={{ fontSize: 14 }}>&#9635;</span>
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
              <span style={{ fontSize: 10, color: "var(--color-warning)" }}>&#9733;</span>
            )}
          </div>
        ))}
      </div>

      <div style={{
        padding: 8, borderTop: "1px solid var(--color-hover)",
        fontSize: 10, color: "var(--color-text-muted)", textAlign: "center",
      }}>
        {t.projectCount(projects.length)}
      </div>
    </aside>
  );
}
