import { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { Plus, X } from "lucide-react";
import { ActionButton } from "./ActionButton";
import type { TemplateFile } from "../lib/tauri";

const cardStyle = { background: "var(--color-card)", padding: "14px 16px" };

const inputStyle = {
  background: "var(--color-hover)",
  color: "var(--color-text)",
  border: "none",
  padding: "6px 10px",
  fontSize: 12,
  outline: "none",
};

const sectionLabel = {
  fontSize: 11,
  color: "var(--color-text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  marginBottom: 10,
};

export function TemplatesView() {
  const t = useT();
  const templates = useAppStore((s) => s.templates);
  const createTemplate = useAppStore((s) => s.createTemplate);
  const removeTemplate = useAppStore((s) => s.removeTemplate);
  const loadTemplates = useAppStore((s) => s.loadTemplates);
  const addToast = useAppStore((s) => s.addToast);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<TemplateFile[]>([{ name: "", content: "" }]);

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      addToast("Template name is required", "error");
      return;
    }
    setCreating(true);
    try {
      const validFiles = files.filter((f) => f.name.trim() !== "");
      await createTemplate(name.trim(), description.trim(), validFiles);
      setName("");
      setDescription("");
      setFiles([{ name: "", content: "" }]);
      addToast(`Template "${name.trim()}" created`, "success");
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setCreating(false);
    }
  };

  const addFileEntry = () => {
    setFiles([...files, { name: "", content: "" }]);
  };

  const updateFile = (idx: number, field: keyof TemplateFile, value: string) => {
    setFiles(files.map((f, i) => (i === idx ? { ...f, [field]: value } : f)));
  };

  const removeFile = (idx: number) => {
    if (files.length <= 1) return;
    setFiles(files.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
        {t.templatesTitle}
      </h2>

      {templates.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionLabel}>{t.availableTemplates}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {templates.map((tmpl) => (
              <div
                key={tmpl.name}
                style={{
                  background: "var(--color-hover)", padding: "10px 14px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ color: "var(--color-text)", fontSize: 13 }}>{tmpl.name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    {tmpl.description || t.filesCount(tmpl.file_count)}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await removeTemplate(tmpl.name);
                      addToast(`Template "${tmpl.name}" removed`, "info");
                    } catch (e) {
                      addToast(String(e), "error");
                    }
                  }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--color-text-muted)", fontSize: 11,
                    transition: "all 0.15s ease",
                  }}
                >
                  {t.deleteTemplate}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {templates.length === 0 && (
        <div style={{ ...cardStyle, color: "var(--color-text-muted)", fontSize: 12 }}>
          {t.noTemplatesYet}
        </div>
      )}

      <div style={cardStyle}>
        <div style={sectionLabel}>{t.createTemplate}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder={t.templateNamePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              placeholder={t.templateDescriptionPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ ...inputStyle, flex: 2 }}
            />
          </div>

          <div style={{ ...sectionLabel, marginTop: 6 }}>
            <span>{t.templateFiles}</span>
            <button
              onClick={addFileEntry}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--color-text-muted)", lineHeight: 1,
                marginLeft: 8,
              }}
            >
              <Plus size={14} strokeWidth={1.5} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {files.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <input
                  placeholder={t.fileName}
                  value={f.name}
                  onChange={(e) => updateFile(i, "name", e.target.value)}
                  style={{ ...inputStyle, width: 160 }}
                />
                <input
                  placeholder={t.fileContent}
                  value={f.content}
                  onChange={(e) => updateFile(i, "content", e.target.value)}
                  style={{ ...inputStyle, flex: 1, fontFamily: "Consolas, monospace", fontSize: 11 }}
                />
                <button
                  onClick={() => removeFile(i)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--color-text-muted)", paddingTop: 6,
                  }}
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ActionButton
        loading={creating}
        onClick={handleCreate}
        style={{
          background: "var(--color-success)", color: "#c0d0c0",
          padding: "8px 20px", alignSelf: "flex-start",
        }}
      >
        {t.createTemplate}
      </ActionButton>
    </div>
  );
}
