import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./lib/store";
import { LeftNav } from "./components/LeftNav";
import { ProjectList } from "./components/ProjectList";
import { RightPanel } from "./components/RightPanel";
import { SettingsView } from "./components/SettingsView";
import { UpdateModal } from "./components/UpdateModal";
import { ToastContainer } from "./components/Toast";
import { CreateProjectDialog } from "./components/CreateProjectDialog";
import { LocaleCtx, getLocale } from "./lib/i18n";
import { checkForUpdate } from "./lib/tauri";
import { invoke } from "@tauri-apps/api/core";

function SettingsModal() {
  const showSettings = useAppStore((s) => s.showSettings);
  const hideSettings = useAppStore((s) => s.hideSettings);

  if (!showSettings) return null;

  return (
    <div
      onClick={hideSettings}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-panel)", width: 620, maxHeight: "80vh",
          overflowY: "auto", padding: "24px 28px",
        }}
      >
        <SettingsView />
      </div>
    </div>
  );
}

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const locale = useAppStore((s) => s.locale);
  const showSettings = useAppStore((s) => s.showSettings);
  const hideSettings = useAppStore((s) => s.hideSettings);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const loadSettings = useAppStore((s) => s.loadSettings);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    loadProjects();
    loadSettings();
  }, []);

  useEffect(() => {
    const unlisten = listen("app-shown", () => {
      useAppStore.getState().setPinnedState(false);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const setUpdateAvailable = useAppStore((s) => s.setUpdateAvailable);
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus);

  useEffect(() => {
    (async () => {
      try {
        const update = await checkForUpdate();
        if (update) {
          setUpdateAvailable({ version: update.version, body: update.body });
          setUpdateStatus("available");
        }
      } catch {
        // offline or no endpoint — silent fail
      }
    })();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showSettings) {
          hideSettings();
        } else {
          invoke("hide_window");
        }
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [showSettings]);

  return (
    <LocaleCtx.Provider value={getLocale(locale)}>
      <div
        style={{
          display: "flex",
          height: "100vh",
          background: "var(--color-base)",
          overflow: "hidden",
        }}
      >
        <LeftNav />
        <ProjectList />
        <RightPanel />
      </div>
      <SettingsModal />
      <CreateProjectDialog />
      <UpdateModal />
      <ToastContainer />
    </LocaleCtx.Provider>
  );
}
