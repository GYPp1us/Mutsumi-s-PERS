import { useState } from "react";
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

export function GitView() {
  const t = useT();
  const selectedId = useAppStore((s) => s.selectedProjectId);
  const projects = useAppStore((s) => s.projects);
  const project = projects.find((p) => p.id === selectedId);
  const [status, setStatus] = useState<string>("");
  const [output, setOutput] = useState<string>("");

  if (!project) {
    return <div style={{ color: "var(--color-text-muted)" }}>{t.gitSelectFirst}</div>;
  }

  const runGit = async (op: string, fn: () => Promise<string>) => {
    setStatus(t.runningGit(op));
    setOutput("");
    try {
      const result = await fn();
      setOutput(result || t.done);
    } catch (e) {
      setOutput(String(e));
    }
    setStatus("");
  };

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
        {t.gitTitle(project.name)}
      </h2>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{project.path}</div>

      <div style={cardStyle}>
        <div style={sectionLabel}>{t.operations}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([
            [t.fetch, () => api.gitFetch(project.path)],
            [t.pull, () => api.gitPull(project.path)],
            [t.push, () => api.gitPush(project.path)],
            [t.status, () => api.gitStatus(project.path)],
          ] as const).map(([label, fn]) => (
            <button
              key={label}
              onClick={() => runGit(label, fn)}
              style={{
                background: "var(--color-card)", color: "var(--color-text-secondary)",
                border: "none", padding: "6px 14px", fontSize: 12, cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {status && (
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 8 }}>{status}</div>
        )}
      </div>

      {output && (
        <div style={cardStyle}>
          <div style={sectionLabel}>{t.output}</div>
          <pre style={{
            fontSize: 11, color: "var(--color-text-secondary)",
            whiteSpace: "pre-wrap", margin: 0, fontFamily: "Consolas, monospace",
          }}>
            {output}
          </pre>
        </div>
      )}
    </>
  );
}
