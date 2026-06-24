import { useState, useRef } from "react";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { updateShortcut, getSettings, updateSettings } from "../lib/tauri";
import { ActionButton } from "./ActionButton";

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 300,
  background: "rgba(0,0,0,0.6)", display: "flex",
  alignItems: "center", justifyContent: "center",
};

const panelStyle: React.CSSProperties = {
  background: "var(--color-panel)", width: 440,
  padding: "28px 32px",
};

const inputStyle: React.CSSProperties = {
  background: "var(--color-hover)",
  color: "var(--color-text)",
  border: "none",
  padding: "10px 14px",
  fontSize: 14,
  fontFamily: "monospace",
  outline: "none",
  width: "100%",
  letterSpacing: "0.5px",
};

export function SetupWizard() {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const completeSetup = useAppStore((s) => s.completeSetup);
  const addToast = useAppStore((s) => s.addToast);

  const [capturing, setCapturing] = useState(false);
  const [keyCode, setKeyCode] = useState("");
  const [ctrl, setCtrl] = useState(false);
  const [alt, setAlt] = useState(false);
  const [shift, setShift] = useState(false);
  const [meta, setMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayCombo = (function () {
    if (!keyCode) return "";
    const parts: string[] = [];
    if (ctrl) parts.push("Ctrl");
    if (alt) parts.push("Alt");
    if (shift) parts.push("Shift");
    if (meta) parts.push("Win");
    const key = keyCode
      .replace(/^Key/, "")
      .replace(/^Digit/, "")
      .replace(/^Arrow/, "");
    parts.push(key);
    return parts.join("+");
  })();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

    setCtrl(e.ctrlKey);
    setAlt(e.altKey);
    setShift(e.shiftKey);
    setMeta(e.metaKey);
    setKeyCode(e.code);
    setCapturing(false);
  };

  const handleInputFocus = () => {
    setCapturing(true);
    setKeyCode("");
    setCtrl(false);
    setAlt(false);
    setShift(false);
    setMeta(false);
  };

  const handleSave = async () => {
    if (!keyCode) {
      addToast("Please press a key combination first", "error");
      return;
    }
    setSaving(true);
    try {
      await updateShortcut(keyCode, ctrl, alt, shift, meta);
      const updated = await getSettings();
      useAppStore.getState().loadSettings();
      completeSetup();
      addToast("Shortcut saved!", "success");
    } catch (e) {
      addToast(`Failed to save shortcut: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      if (settings) {
        await updateSettings({ ...settings, setup_completed: true });
        useAppStore.getState().loadSettings();
      }
      completeSetup();
    } catch {
      completeSetup();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>
          {t.setupWizardTitle}
        </div>

        <div style={{
          fontSize: 12, color: "var(--color-text-muted)", marginBottom: 24,
          lineHeight: 1.7, whiteSpace: "pre-wrap",
        }}>
          {t.setupWizardDesc}
        </div>

        <div style={{ marginBottom: 6, fontSize: 11, color: "var(--color-text-secondary)" }}>
          {t.setupWizardShortcut}
        </div>

        <input
          ref={inputRef}
          type="text"
          readOnly
          value={capturing ? "" : displayCombo}
          placeholder={capturing ? "..." : t.setupWizardPressHint}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          onBlur={() => setCapturing(false)}
          style={{
            ...inputStyle,
            cursor: capturing ? "text" : "pointer",
            background: capturing ? "var(--color-primary)" : "var(--color-hover)",
            color: capturing ? "var(--color-primary-fg)" : "var(--color-text)",
            transition: "all 0.15s ease",
          }}
        />

        <div style={{
          fontSize: 10, color: "var(--color-text-muted)", marginTop: 6, marginBottom: 24,
        }}>
          {capturing ? "Press your key combination now..." : "\u00A0"}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <ActionButton
            loading={false}
            onClick={handleSkip}
            style={{ background: "var(--color-card)", color: "var(--color-text-secondary)" }}
          >
            {t.setupWizardSkip}
          </ActionButton>
          <ActionButton
            loading={saving}
            onClick={handleSave}
            style={{ background: "var(--color-primary)", color: "var(--color-primary-fg)" }}
          >
            {t.setupWizardSave}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
