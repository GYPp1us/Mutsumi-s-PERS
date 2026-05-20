import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";

const btnStyle = {
  width: 34,
  height: 34,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  background: "transparent",
  border: "none",
  color: "inherit",
  cursor: "pointer",
} as const;

export function LeftNav() {
  const t = useT();
  const navView = useAppStore((s) => s.navView);
  const setNavView = useAppStore((s) => s.setNavView);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const navItems = [
    { id: "home" as const, icon: "\u2302", label: t.navHome },
    { id: "projects" as const, icon: "\u2637", label: t.navProjects },
    { id: "templates" as const, icon: "\u2750", label: t.navTemplates },
    { id: "git" as const, icon: "\u21BB", label: t.navGit },
  ];

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
      <div style={{ fontSize: 18, opacity: 0.8, marginBottom: 8 }}>&#9671;</div>

      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            setNavView(item.id);
            if (item.id !== "projects") {
              useAppStore.getState().selectProject(null);
            }
          }}
          title={item.label}
          style={{
            ...btnStyle,
            opacity: navView === item.id ? 1 : 0.35,
            background:
              navView === item.id ? "var(--color-hover)" : "transparent",
          }}
        >
          {item.icon}
        </button>
      ))}

      <div style={{ flex: 1 }} />

      <button
        onClick={() => setNavView("settings")}
        title={t.navSettings}
        style={{
          ...btnStyle,
          opacity: navView === "settings" ? 1 : 0.35,
          background:
            navView === "settings" ? "var(--color-hover)" : "transparent",
        }}
      >
        &#9881;
      </button>

      <button
        onClick={toggleTheme}
        title={t.toggleTheme}
        style={{ ...btnStyle, opacity: 0.7 }}
      >
        {theme === "dark" ? "\u25C9" : "\u25CB"}
      </button>
    </nav>
  );
}
