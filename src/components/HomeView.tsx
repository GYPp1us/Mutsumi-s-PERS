import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { Folder, Star } from "lucide-react";

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
                  padding: "8px 0", cursor: "pointer", transition: "opacity 0.12s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Folder size={14} strokeWidth={1.5} />
                  <span style={{ color: "#58a6ff", fontSize: 13 }}>{p.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                    {new Date(p.last_opened).toLocaleDateString()}
                  </span>
                  {p.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
                </div>
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
                  padding: "8px 0", cursor: "pointer", transition: "opacity 0.12s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Folder size={14} strokeWidth={1.5} />
                  <span style={{ color: "#58a6ff", fontSize: 13 }}>{p.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{p.path}</span>
                  <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
