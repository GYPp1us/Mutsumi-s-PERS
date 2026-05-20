import { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import type { EditorConfig } from "../lib/tauri";
import * as api from "../lib/tauri";

const sectionLabel = {
  fontSize: 11,
  color: "var(--color-text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  marginBottom: 10,
  display: "flex" as const,
  justifyContent: "space-between" as const,
};

const cardStyle = { background: "var(--color-card)", padding: "14px 16px" };

const inputStyle = {
  background: "var(--color-hover)",
  color: "var(--color-text)",
  border: "none",
  padding: "6px 10px",
  fontSize: 12,
  outline: "none",
};

export function SettingsView() {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);

  const [editors, setEditors] = useState<EditorConfig[]>([]);
  const [shortcut, setShortcut] = useState("");

  useEffect(() => {
    if (settings) {
      setEditors(settings.editors);
      setShortcut(settings.shortcut);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!settings) return;
    await api.updateSettings({ ...settings, shortcut, editors });
    await loadSettings();
    alert(t.settingsSaved);
  };

  const addEditor = () => {
    setEditors([
      ...editors,
      { id: `editor-${Date.now()}`, name: "", path: "", args: ["{path}"] },
    ]);
  };

  const updateEditor = (idx: number, field: keyof EditorConfig, value: string | string[]) => {
    const updated = editors.map((e, i) => (i === idx ? { ...e, [field]: value } : e));
    setEditors(updated);
  };

  const removeEditor = (idx: number) => {
    setEditors(editors.filter((_, i) => i !== idx));
  };

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
        {t.settingsTitle}
      </h2>

      <div style={cardStyle}>
        <div style={sectionLabel}><span>{t.appearance}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "var(--color-text-secondary)" }}>{t.themeLabel}</span>
          <button
            onClick={toggleTheme}
            style={{
              background: "var(--color-primary)", color: "var(--color-primary-fg)",
              border: "none", padding: "6px 14px", fontSize: 12, cursor: "pointer",
            }}
          >
            {theme === "dark" ? t.themeDark : t.themeLight}
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionLabel}><span>{t.language}</span></div>
        <div style={{ display: "flex", gap: 8 }}>
          {([["en", "English"], ["zh", "\u4E2D\u6587"]] as const).map(([code, label]) => (
            <button
              key={code}
              onClick={() => setLocale(code)}
              style={{
                background: locale === code ? "var(--color-primary)" : "var(--color-card)",
                color: locale === code ? "var(--color-primary-fg)" : "var(--color-text-secondary)",
                border: "none", padding: "6px 14px", fontSize: 12, cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionLabel}><span>{t.globalShortcut}</span></div>
        <input
          type="text"
          value={shortcut}
          onChange={(e) => setShortcut(e.target.value)}
          placeholder={t.shortcutPlaceholder}
          style={{ ...inputStyle, width: 200 }}
        />
      </div>

      <div style={cardStyle}>
        <div style={sectionLabel}>
          <span>{t.editors}</span>
          <button
            onClick={addEditor}
            style={{
              background: "none", border: "none",
              color: "var(--color-text-muted)", fontSize: 16,
              cursor: "pointer", lineHeight: 1,
            }}
          >
            +
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {editors.map((ed, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                placeholder={t.editorName}
                value={ed.name}
                onChange={(e) => updateEditor(i, "name", e.target.value)}
                style={{ ...inputStyle, width: 90 }}
              />
              <input
                placeholder={t.editorPath}
                value={ed.path}
                onChange={(e) => updateEditor(i, "path", e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                placeholder={t.editorArgs}
                value={ed.args.join(", ")}
                onChange={(e) =>
                  updateEditor(i, "args", e.target.value.split(",").map((s) => s.trim()))
                }
                style={{ ...inputStyle, width: 130, fontSize: 11 }}
              />
              <button
                onClick={() => removeEditor(i)}
                style={{
                  background: "none", border: "none",
                  color: "var(--color-text-muted)", fontSize: 14, cursor: "pointer",
                }}
              >
                &#10005;
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        style={{
          background: "var(--color-success)", color: "#c0d0c0",
          border: "none", padding: "8px 20px", fontSize: 12,
          cursor: "pointer", alignSelf: "flex-start",
        }}
      >
        {t.saveSettings}
      </button>
    </>
  );
}
