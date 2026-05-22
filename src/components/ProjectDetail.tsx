import { useState } from "react";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import * as api from "../lib/tauri";
import { Star, Play, GitBranch, LayoutTemplate } from "lucide-react";

const sectionLabel = {
  fontSize: 11,
  color: "var(--color-text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  marginBottom: 10,
};

const cardStyle = { background: "var(--color-card)", padding: "14px 16px" };

const btnBase = {
  border: "none",
  padding: "6px 14px",
  fontSize: 12,
  cursor: "pointer",
  transition: "all 0.15s ease",
} as const;
export function ProjectDetail() {
  const t = useT();
  const selectedId = useAppStore((s) => s.selectedProjectId);
  const projects = useAppStore((s) => s.projects);
  const settings = useAppStore((s) => s.settings);
  const toggleStar = useAppStore((s) => s.toggleStar);
  const addToast = useAppStore((s) => s.addToast);

  const project = projects.find((p) => p.id === selectedId);
  if (!project)
    return <div style={{ color: "var(--color-text-muted)" }}>{t.selectProject}</div>;

  const handleLaunch = async (editorId: string, editorName: string) => {
    try {
      await api.launchEditor(editorId, project.path);
      addToast(`\u2713 ${editorName}`, "success");
    } catch (e) {
      addToast(`\u2717 ${editorName}: ${e}`, "error");
    }
  };

  const handleLaunchAll = async () => {
    const editors =
      project.editors.length > 0
        ? project.editors
        : settings?.editors.map((e) => e.id) || [];
    for (const id of editors) {
      const ed = settings?.editors.find((e) => e.id === id);
      await handleLaunch(id, ed?.name || id);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, minHeight: 0 }}>
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
            background: "none", border: "none", cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <Star
            size={18}
            strokeWidth={1.5}
            color={project.starred ? "var(--color-warning)" : "var(--color-text-muted)"}
            fill={project.starred ? "var(--color-warning)" : "none"}
          />
        </button>
      </div>

      {/* Launch */}
      <div style={cardStyle}>
        <div style={sectionLabel}>{t.launchEnv}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(settings?.editors || []).map((ed) => (
            <button
              key={ed.id}
              onClick={() => handleLaunch(ed.id, ed.name)}
              style={{
                ...btnBase,
                background: "var(--color-primary)", color: "var(--color-primary-fg)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.2)")}
              onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
            >
              {ed.name}
            </button>
          ))}
          <button
            onClick={handleLaunchAll}
            style={{
              ...btnBase,
              background: "var(--color-card)", color: "var(--color-text-secondary)",
              display: "flex", alignItems: "center", gap: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.2)"; e.currentTarget.style.color = "var(--color-text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
          >
            <Play size={14} strokeWidth={1.5} />
            {t.launchAll.replace("\u25B6 ", "")}
          </button>
        </div>
      </div>

      {/* Git */}
      <GitSection projectPath={project.path} />

      {/* Template */}
      <TemplateSection projectId={project.id} projectPath={project.path} />

      {/* Tags + Info */}
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

      {/* Activity */}
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
    </div>
  );
}

function GitSection({ projectPath }: { projectPath: string }) {
  const t = useT();
  const addToast = useAppStore((s) => s.addToast);
  const [status, setStatus] = useState<string>("");
  const [output, setOutput] = useState<string>("");

  const runGit = async (op: string, fn: () => Promise<string>) => {
    setStatus(t.runningGit(op));
    setOutput("");
    try {
      const result = await fn();
      setOutput(result || t.done);
      addToast(`\u2713 git ${op}`, "success");
    } catch (e) {
      setOutput(String(e));
      addToast(`\u2717 git ${op}: ${e}`, "error");
    }
    setStatus("");
  };

  return (
    <div style={cardStyle}>
      <div style={{ ...sectionLabel, display: "flex", alignItems: "center", gap: 6 }}>
        <GitBranch size={14} strokeWidth={1.5} />
        <span>{t.navGit}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: status ? 8 : 0 }}>
        {([
          [t.fetch, () => api.gitFetch(projectPath)],
          [t.pull, () => api.gitPull(projectPath)],
          [t.push, () => api.gitPush(projectPath)],
          [t.status, () => api.gitStatus(projectPath)],
        ] as const).map(([label, fn]) => (
          <button
            key={label}
            onClick={() => runGit(label, fn)}
            style={{
              background: "var(--color-card)", color: "var(--color-text-secondary)",
              border: "none", padding: "6px 14px", fontSize: 12, cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.2)"; e.currentTarget.style.color = "var(--color-text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
          >
            {label}
          </button>
        ))}
      </div>
      {status && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8 }}>{status}</div>}
      {output && (
        <pre style={{
          fontSize: 11, color: "var(--color-text-secondary)",
          whiteSpace: "pre-wrap", margin: 0, fontFamily: "Consolas, monospace",
        }}>
          {output}
        </pre>
      )}
    </div>
  );
}

function TemplateSection({ projectId, projectPath }: { projectId: string; projectPath: string }) {
  const t = useT();
  const projects = useAppStore((s) => s.projects);
  const addToast = useAppStore((s) => s.addToast);
  const [status, setStatus] = useState<string>("");

  const handleInject = async () => {
    setStatus(t.injecting);
    try {
      const result = await api.injectTemplate("", projectPath, [], "skip");
      const name = projects.find((p) => p.id === projectId)?.name || "";
      setStatus(t.injectedFiles(result.length, name));
      addToast(t.injectedFiles(result.length, name), "success");
    } catch (e) {
      addToast(t.error(e), "error");
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ ...sectionLabel, display: "flex", alignItems: "center", gap: 6 }}>
        <LayoutTemplate size={14} strokeWidth={1.5} />
        <span>{t.navTemplates}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 10 }}>
        {t.templateHelp}
      </div>

      <div style={{
        background: "var(--color-hover)", padding: "10px 14px", marginBottom: 10,
      }}>
        <div style={{ color: "var(--color-text)" }}>{t.defaultTemplateName}</div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          {t.general} &middot; {t.defaultTemplateDesc}
        </div>
      </div>

      <button
        onClick={handleInject}
        style={{
          background: "var(--color-primary)", color: "var(--color-primary-fg)",
          border: "none", padding: "8px 16px", fontSize: 12, cursor: "pointer",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.2)")}
        onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
      >
        {t.injectTemplate}
      </button>

      {status && (
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 10 }}>{status}</div>
      )}
    </div>
  );
}
