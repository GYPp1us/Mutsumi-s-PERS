import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";

export function LeftNav() {
  const t = useT();
  const showSettings = useAppStore((s) => s.showSettings);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const btnStyle = {
    width: 34,
    height: 34,
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    fontSize: 16,
    background: "transparent",
    border: "none",
    color: "inherit",
    cursor: "pointer",
  };

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

      <button
        title={t.navProjects}
        style={{
          ...btnStyle,
          opacity: !showSettings ? 1 : 0.35,
          background: !showSettings ? "var(--color-hover)" : "transparent",
        }}
      >
        &#x2637;
      </button>

      <div style={{ flex: 1 }} />

      <button
        onClick={toggleSettings}
        title={t.navSettings}
        style={{
          ...btnStyle,
          opacity: showSettings ? 1 : 0.35,
          background: showSettings ? "var(--color-hover)" : "transparent",
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
