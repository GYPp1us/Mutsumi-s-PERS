import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { Diamond, Folders, Pin, PinOff, Settings, Moon, Sun, Download } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

const btnBase = {
  width: 34,
  height: 34,
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  background: "transparent",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  transition: "all 0.15s ease",
  outline: "none",
};

const hoverIn = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.transform = "scale(1.08)";
  e.currentTarget.style.opacity = "1";
};
const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.transform = "";
};
const pressIn = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.transform = "scale(0.93)";
};
const pressOut = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.transform = "scale(1.08)";
};

export function LeftNav() {
  const t = useT();
  const showSettings = useAppStore((s) => s.showSettings);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const pinned = useAppStore((s) => s.pinned);
  const togglePin = useAppStore((s) => s.togglePin);
  const updateStatus = useAppStore((s) => s.updateStatus);
  const setUpdateAvailable = useAppStore((s) => s.setUpdateAvailable);
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus);
  const addToast = useAppStore((s) => s.addToast);

  return (
    <nav
      style={{
        width: 56,
        background: "var(--color-base)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 0",
        gap: 20,
        flexShrink: 0,
      }}
    >
      <div
        style={{ marginBottom: 8, cursor: "grab" }}
        data-tauri-drag-region
        onMouseDown={() => invoke("start_drag_pin")}
      >
        <Diamond size={18} strokeWidth={1.5} style={{ opacity: 0.8, pointerEvents: "none" }} />
      </div>

      <button
        title={t.navProjects}
        style={{
          ...btnBase,
          opacity: !showSettings ? 1 : 0.35,
          background: !showSettings ? "var(--color-hover)" : "transparent",
        }}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onMouseDown={pressIn}
        onMouseUp={pressOut}
      >
        <Folders size={18} strokeWidth={1.5} />
      </button>

      <div style={{ flex: 1 }} />

      <button
        onClick={togglePin}
        title={pinned ? "\u9489\u9009" : "\u672A\u9489\u9009"}
        style={{
          ...btnBase,
          opacity: pinned ? 1 : 0.4,
          background: pinned ? "var(--color-hover)" : "transparent",
        }}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onMouseDown={pressIn}
        onMouseUp={pressOut}
      >
        {pinned ? <Pin size={18} strokeWidth={1.5} /> : <PinOff size={18} strokeWidth={1.5} />}
      </button>

      <button
        onClick={toggleSettings}
        title={t.navSettings}
        style={{
          ...btnBase,
          opacity: showSettings ? 1 : 0.35,
          background: showSettings ? "var(--color-hover)" : "transparent",
        }}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onMouseDown={pressIn}
        onMouseUp={pressOut}
      >
        <Settings size={18} strokeWidth={1.5} />
      </button>

      <button
        onClick={async () => {
          setUpdateStatus("checking");
          try {
            const { check } = await import("@tauri-apps/plugin-updater");
            const update = await check();
            if (update) {
              setUpdateAvailable({ version: update.version, body: update.body });
              setUpdateStatus("available");
            } else {
              setUpdateStatus("idle");
              addToast("\u2713 You\u2019re up to date", "info");
            }
          } catch {
            setUpdateStatus("idle");
          }
        }}
        title="Check for Updates"
        style={{
          ...btnBase,
          opacity: updateStatus === "checking" ? 0.5 : 0.7,
        }}
        disabled={updateStatus === "checking"}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onMouseDown={pressIn}
        onMouseUp={pressOut}
      >
        <Download size={18} strokeWidth={1.5} />
      </button>

      <button
        onClick={toggleTheme}
        title={t.toggleTheme}
        style={{ ...btnBase, opacity: 0.7 }}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onMouseDown={pressIn}
        onMouseUp={pressOut}
      >
        {theme === "dark" ? <Moon size={18} strokeWidth={1.5} /> : <Sun size={18} strokeWidth={1.5} />}
      </button>
    </nav>
  );
}
