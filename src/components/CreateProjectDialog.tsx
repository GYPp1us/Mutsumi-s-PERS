import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { ActionButton } from "./ActionButton";
import { FolderOpen } from "lucide-react";

const inputStyle = {
  background: "var(--color-hover)",
  color: "var(--color-text)",
  border: "none",
  padding: "8px 12px",
  fontSize: 12,
  outline: "none",
};

export function CreateProjectDialog() {
  const t = useT();
  const showCreateProject = useAppStore((s) => s.showCreateProject);
  const closeCreateProject = useAppStore((s) => s.closeCreateProject);
  const addProjectQuick = useAppStore((s) => s.addProjectQuick);
  const settings = useAppStore((s) => s.settings);
  const templates = useAppStore((s) => s.templates);
  const loadTemplates = useAppStore((s) => s.loadTemplates);
  const addToast = useAppStore((s) => s.addToast);

  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showCreateProject) {
      loadTemplates();
      setName("");
      setPath("");
      setTemplateName("");
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [showCreateProject]);

  if (!showCreateProject) return null;

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      addToast("Project name is required", "error");
      return;
    }
    setCreating(true);
    try {
      let finalPath = path.trim();
      if (!finalPath && settings?.default_project_path) {
        finalPath = `${settings.default_project_path.replace(/[\\/]+$/, "")}\\${trimmedName}`;
      }
      await addProjectQuick(trimmedName, finalPath, templateName || null);
      addToast(`Project "${trimmedName}" created`, "success");
    } catch (e) {
      addToast(`Failed to create project: ${e}`, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleBrowse = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({
        directory: true,
        multiple: false,
        title: t.selectFolderTitle,
      });
      if (dir) {
        setPath(dir as string);
      }
    } catch (e) {
      console.error("Browse failed:", e);
    }
  };

  return (
    <div
      onClick={closeCreateProject}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-panel)", width: 480, padding: "24px 28px",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text)", margin: "0 0 18px" }}>
          {t.newProject}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6 }}>
              {t.createProjectName}
            </div>
            <input
              ref={nameRef}
              placeholder={t.createProjectNamePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6 }}>
              {t.createProjectPath}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder={settings?.default_project_path
                  ? `${settings.default_project_path}\\<name>`
                  : t.createProjectPathPlaceholder}
                value={path}
                onChange={(e) => setPath(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={handleBrowse}
                style={{
                  background: "var(--color-card)", color: "var(--color-text-secondary)",
                  border: "none", padding: "6px 12px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4, fontSize: 12,
                  transition: "all 0.15s ease",
                }}
              >
                <FolderOpen size={14} strokeWidth={1.5} />
                {t.browse}
              </button>
            </div>
          </div>

          {templates.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6 }}>
                {t.applyTemplate}
              </div>
              <select
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
              >
                <option value="">{t.noTemplate}</option>
                {templates.map((tmpl) => (
                  <option key={tmpl.name} value={tmpl.name}>{tmpl.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
          <button
            onClick={closeCreateProject}
            disabled={creating}
            style={{
              background: "var(--color-card)", color: "var(--color-text-secondary)",
              border: "none", padding: "8px 16px", fontSize: 12, cursor: creating ? "default" : "pointer",
              opacity: creating ? 0.5 : 1, transition: "all 0.15s ease",
            }}
          >
            Cancel
          </button>
          <ActionButton
            loading={creating}
            onClick={handleCreate}
            style={{ background: "var(--color-success)", color: "#c0d0c0", padding: "8px 16px" }}
          >
            {t.createProjectBtn}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
