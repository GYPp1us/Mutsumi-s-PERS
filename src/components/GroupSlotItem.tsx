// ============================================================================
// 文件 12/13: src/components/GroupSlotItem.tsx
// 作用: "拖出此组"幽灵槽位的渲染 — 虚线边框 + 提示文字
// 被拖入时变实线高亮（isOnto = true）
// ============================================================================

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
      opacity: isOnto ? 1 : 0.5,
      transition: "border-color 0.15s, color 0.15s",
    }}>
      {isOnto ? t.groupSlotHoverText : ""}
    </div>
  );
}
