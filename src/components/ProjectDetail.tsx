import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import * as api from "../lib/tauri";

const sectionLabel = {
  fontSize: 11,
  color: "var(--color-text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  marginBottom: 10,
};

const cardStyle = { background: "var(--color-card)", padding: "14px 16px" };

export function ProjectDetail() {
  const t = useT();
  const selectedId = useAppStore((s) => s.selectedProjectId);
  const projects = useAppStore((s) => s.projects);
  const settings = useAppStore((s) => s.settings);
  const toggleStar = useAppStore((s) => s.toggleStar);

  const project = projects.find((p) => p.id === selectedId);
  if (!project)
    return <div style={{ color: "var(--color-text-muted)" }}>{t.selectProject}</div>;

  const handleLaunch = async (editorId: string) => {
    try { await api.launchEditor(editorId, project.path); } catch (e) { console.error(e); }
  };

  const handleLaunchAll = async () => {
    const editors =
      project.editors.length > 0
        ? project.editors
        : settings?.editors.map((e) => e.id) || [];
    for (const id of editors) await handleLaunch(id);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
            {project.name}
          </h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
            {project.path}
          </div>
        </div>
        <button
          onClick={() => toggleStar(project.id, !project.starred)}
          style={{
            background: "none", border: "none", fontSize: 18, cursor: "pointer",
            color: project.starred ? "var(--color-warning)" : "var(--color-text-muted)",
          }}
        >
          &#9733;
        </button>
      </div>

      <div style={cardStyle}>
        <div style={sectionLabel}>{t.launchEnv}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(settings?.editors || []).map((ed) => (
            <button
              key={ed.id}
              onClick={() => handleLaunch(ed.id)}
              style={{
                background: "var(--color-primary)", color: "var(--color-primary-fg)",
                border: "none", padding: "6px 14px", fontSize: 12, cursor: "pointer",
              }}
            >
              {ed.name}
            </button>
          ))}
          <button
            onClick={handleLaunchAll}
            style={{
              background: "var(--color-card)", color: "var(--color-text-secondary)",
              border: "none", padding: "6px 14px", fontSize: 12, cursor: "pointer",
            }}
          >
            {t.launchAll}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ ...cardStyle, flex: 1 }}>
          <div style={sectionLabel}>{t.tags}</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {project.tags.length > 0
              ? project.tags.map((tag) => (
                  <span key={tag} style={{
                    background: "var(--color-tag)", color: "var(--color-tag-fg)",
                    padding: "2px 8px", fontSize: 11,
                  }}>
                    {tag}
                  </span>
                ))
              : <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{t.noTags}</span>}
          </div>
        </div>
        <div style={{ ...cardStyle, flex: 1 }}>
          <div style={sectionLabel}>{t.lastOpened}</div>
          <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
            {new Date(project.last_opened).toLocaleString()}
          </div>
        </div>
      </div>

      {project.activity_log.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionLabel}>{t.recentActivity}</div>
          {project.activity_log.slice(-5).reverse().map((a, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--color-text-muted)", padding: "2px 0" }}>
              {a.action} {a.detail} &mdash; {new Date(a.time).toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
