import { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import type { EditorConfig } from "../lib/tauri";
import * as api from "../lib/tauri";
import { getVersion } from "@tauri-apps/api/app";
import { Plus, X, ExternalLink } from "lucide-react";
import { checkForUpdate } from "../lib/tauri";

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
  const [appVersion, setAppVersion] = useState("");
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateFound, setUpdateFound] = useState<{ version: string; body?: string } | null>(null);
  const [upToDate, setUpToDate] = useState(false);

  const setUpdateAvailable = useAppStore((s) => s.setUpdateAvailable);
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus);
  const addToast = useAppStore((s) => s.addToast);

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
        {t.settingsTitle}
      </h2>

      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={sectionLabel}><span>{t.about}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ color: "var(--color-text)", fontSize: 13 }}>
              {t.version}: {appVersion || "..."}
            </div>
            <a
              href="https://github.com/GYPp1us/Mutsumi-s-PERS"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--color-primary-fg)", fontSize: 11,
                display: "flex", alignItems: "center", gap: 4, textDecoration: "none",
              }}
            >
              <ExternalLink size={12} strokeWidth={1.5} />
              {t.githubRepo}
            </a>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            {updateFound && (
              <span style={{ color: "var(--color-success)", fontSize: 11 }}>
                {"\u25CF"} {t.updateAvailable}
              </span>
            )}
            {upToDate && (
              <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
                {t.upToDate}
              </span>
            )}
            <button
              onClick={async () => {
                if (updateFound) {
                  setUpdateAvailable({ version: updateFound.version, body: updateFound.body });
                  setUpdateStatus("available");
                  return;
                }
                setUpdateChecking(true);
                setUpToDate(false);
                try {
                  const update = await checkForUpdate();
                  if (update) {
                    setUpdateFound({ version: update.version, body: update.body });
                    setUpToDate(false);
                  } else {
                    setUpdateFound(null);
                    setUpToDate(true);
                    setTimeout(() => setUpToDate(false), 3000);
                  }
                } catch (e) {
                  addToast(`Update check failed: ${e}`, "error");
                } finally {
                  setUpdateChecking(false);
                }
              }}
              disabled={updateChecking}
              style={{
                background: updateFound ? "var(--color-primary)" : "var(--color-card)",
                color: updateFound ? "var(--color-primary-fg)" : "var(--color-text-secondary)",
                border: "none", padding: "6px 14px", fontSize: 12, cursor: updateChecking ? "default" : "pointer",
                opacity: updateChecking ? 0.5 : 1,
                transition: "all 0.15s ease",
              }}
            >
              {updateChecking ? "\u00B7 \u00B7 \u00B7" : updateFound ? t.checkDetail : t.checkUpdates}
            </button>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionLabel}><span>{t.appearance}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "var(--color-text-secondary)" }}>{t.themeLabel}</span>
          <button
            onClick={toggleTheme}
            style={{
              background: "var(--color-primary)", color: "var(--color-primary-fg)",
              border: "none", padding: "6px 14px", fontSize: 12, cursor: "pointer",
              transition: "all 0.15s ease",
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
                transition: "all 0.15s ease",
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
              color: "var(--color-text-muted)",
              cursor: "pointer", lineHeight: 1,
            }}
          >
            <Plus size={16} strokeWidth={1.5} />
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
                  color: "var(--color-text-muted)", cursor: "pointer",
                }}
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 12, lineHeight: 1.6 }}>
          {t.editorHelp}
        </div>
      </div>

      <button
        onClick={handleSave}
        style={{
          background: "var(--color-success)", color: "#c0d0c0",
          border: "none", padding: "8px 20px", fontSize: 12,
          cursor: "pointer", alignSelf: "flex-start", transition: "all 0.15s ease",
        }}
      >
        {t.saveSettings}
      </button>
    </div>
  );
}
