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

const BUILTIN_TEMPLATES = [
  { id: "default", category: "general", path: "" },
];

export function TemplateView() {
  const t = useT();
  const projects = useAppStore((s) => s.projects);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [targetProjectId, setTargetProjectId] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const templates = BUILTIN_TEMPLATES.map((tmpl) => ({
    ...tmpl,
    name: t.defaultTemplateName,
    description: t.defaultTemplateDesc,
  }));

  const handleInject = async () => {
    const template = templates.find((tmpl) => tmpl.id === selectedTemplate);
    const target = projects.find((p) => p.id === targetProjectId);
    if (!template || !target) return;
    setStatus(t.injecting);
    try {
      const result = await api.injectTemplate(template.path, target.path, [], "skip");
      setStatus(t.injectedFiles(result.length, target.name));
    } catch (e) {
      setStatus(t.error(e));
    }
  };

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
        {t.templatesTitle}
      </h2>

      <div style={cardStyle}>
        <div style={sectionLabel}>{t.availableTemplates}</div>
        {templates.map((tmpl) => (
          <div
            key={tmpl.id}
            onClick={() => setSelectedTemplate(tmpl.id)}
            style={{
              padding: "10px 14px", cursor: "pointer",
              background: selectedTemplate === tmpl.id ? "var(--color-hover)" : "transparent",
            }}
          >
            <div style={{ color: "var(--color-text)" }}>&#10064; {tmpl.name}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {t.general} &middot; {tmpl.description}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", padding: "10px 14px", marginTop: 8 }}>
          {t.templateHelp}
        </div>
      </div>

      {selectedTemplate && (
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={sectionLabel}>{t.targetProject}</div>
          <select
            value={targetProjectId}
            onChange={(e) => setTargetProjectId(e.target.value)}
            style={{
              background: "var(--color-card)", color: "var(--color-text)",
              border: "none", padding: "8px 12px", fontSize: 12, outline: "none",
            }}
          >
            <option value="">{t.selectProjectPlaceholder}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <button
            onClick={handleInject}
            disabled={!targetProjectId}
            style={{
              background: targetProjectId ? "var(--color-primary)" : "var(--color-card)",
              color: targetProjectId ? "var(--color-primary-fg)" : "var(--color-text-muted)",
              border: "none", padding: "8px 16px", fontSize: 12,
              cursor: targetProjectId ? "pointer" : "default", alignSelf: "flex-start",
            }}
          >
            {t.injectTemplate}
          </button>

          {status && (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{status}</div>
          )}
        </div>
      )}
    </>
  );
}
