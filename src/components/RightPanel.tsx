import { useAppStore } from "../lib/store";
import { HomeView } from "./HomeView";
import { ProjectDetail } from "./ProjectDetail";
import { TemplateView } from "./TemplateView";
import { GitView } from "./GitView";
import { SettingsView } from "./SettingsView";

export function RightPanel() {
  const navView = useAppStore((s) => s.navView);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);

  const renderContent = () => {
    switch (navView) {
      case "home":
        return <HomeView />;
      case "projects":
        return selectedProjectId ? <ProjectDetail /> : <HomeView />;
      case "templates":
        return <TemplateView />;
      case "git":
        return <GitView />;
      case "settings":
        return <SettingsView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <main
      style={{
        flex: 1,
        background: "var(--color-panel)",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        overflowY: "auto",
      }}
    >
      {renderContent()}
    </main>
  );
}
