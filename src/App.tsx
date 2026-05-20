import { useEffect } from "react";
import { useAppStore } from "./lib/store";
import { LeftNav } from "./components/LeftNav";
import { ProjectList } from "./components/ProjectList";
import { RightPanel } from "./components/RightPanel";
import { LocaleCtx, getLocale } from "./lib/i18n";

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const locale = useAppStore((s) => s.locale);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const loadSettings = useAppStore((s) => s.loadSettings);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    loadProjects();
    loadSettings();
  }, []);

  return (
    <LocaleCtx.Provider value={getLocale(locale)}>
      <div
        style={{
          display: "flex",
          height: "100vh",
          background: "var(--color-base)",
        }}
      >
        <LeftNav />
        <ProjectList />
        <RightPanel />
      </div>
    </LocaleCtx.Provider>
  );
}
