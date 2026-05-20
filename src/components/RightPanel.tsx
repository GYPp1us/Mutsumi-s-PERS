import { useAppStore } from "../lib/store";
import { HomeView } from "./HomeView";
import { ProjectDetail } from "./ProjectDetail";

export function RightPanel() {
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);

  return (
    <main
      style={{
        flex: 1,
        background: "var(--color-panel)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        minHeight: 0,
      }}
    >
      <div style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "20px 24px" }}>
        {selectedProjectId ? <ProjectDetail /> : <HomeView />}
      </div>
    </main>
  );
}
