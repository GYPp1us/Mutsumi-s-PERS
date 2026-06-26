import { useT } from "../lib/i18n";

export function GroupSlotItem({ isOnto }: { isOnto: boolean }) {
  const t = useT();
  return (
    <div style={{
      height: 40, margin: "1px 14px 1px 22px",
      border: `2px ${isOnto ? "solid var(--color-primary)" : "dashed var(--color-text-muted)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11,
      color: isOnto ? "var(--color-primary)" : "var(--color-text-muted)",
      opacity: 0.5,
      transition: "border-color 0.15s, color 0.15s",
    }}>
      {t.groupSlotText}
    </div>
  );
}
