import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";

const sectionLabel = {
  fontSize: 11,
  color: "var(--color-text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  marginBottom: 10,
};

export function HomeView() {
  const t = useT();
  const projects = useAppStore((s) => s.projects);
  const selectProject = useAppStore((s) => s.selectProject);

  const recent = [...projects]
    .sort(
      (a, b) =>
        new Date(b.last_opened).getTime() - new Date(a.last_opened).getTime()
    )
    .slice(0, 5);

  const starred = projects.filter((p) => p.starred);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
        {t.homeTitle}
      </h2>

      <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
        <div style={sectionLabel}>{t.recentProjects}</div>
        {recent.length === 0 ? (
          <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{t.noProjects}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recent.map((p) => (
              <div
                key={p.id}
                onClick={() => selectProject(p.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0", cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ color: "#58a6ff", fontSize: 13 }}>&#9635; {p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                    {new Date(p.last_opened).toLocaleDateString()}
                  </div>
                </div>
                {p.starred && (
                  <span style={{ color: "var(--color-warning)", fontSize: 12 }}>&#9733;</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: "var(--color-card)", padding: "14px 16px" }}>
        <div style={sectionLabel}>{t.starred}</div>
        {starred.length === 0 ? (
          <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{t.noStarred}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {starred.map((p) => (
              <div
                key={p.id}
                onClick={() => selectProject(p.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0", cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ color: "#58a6ff", fontSize: 13 }}>&#9635; {p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{p.path}</div>
                </div>
                <span style={{ color: "var(--color-warning)", fontSize: 12 }}>&#9733;</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
