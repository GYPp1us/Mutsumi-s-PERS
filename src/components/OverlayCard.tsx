// ============================================================================
// 文件 13/13: src/components/OverlayCard.tsx
// 作用: 拖拽浮动卡片 — 跟随鼠标显示被拖拽项 + 操作提示 badge
//
// badge 显示逻辑:
//   目标 group-slot  → "移出此组"
//   目标在分组中     → "加入「分组名」"
//   目标无分组(onto) → "新建分组"
//   其他             → 无 badge
//
// leftIcon 逻辑:
//   group-slot       → 文件夹图标
//   目标分组          → 分组颜色竖条
//   其他             → 文件夹图标
// ============================================================================

import { Folder, Star, ChevronDown } from "lucide-react";
import { useT } from "../lib/i18n";
import type { TreeItem } from "../lib/store";
import type { GroupInfo, Project } from "../lib/tauri";
import type { DragZone } from "../lib/drag";

export function OverlayCard({ item, ontoGroupId, dragZone, groups, projects, itemMap, dragTargetId }: {
  item: TreeItem; ontoGroupId: string | null; dragZone: DragZone;
  groups: GroupInfo[]; projects: Project[];
  itemMap: Map<string, TreeItem>; dragTargetId: string | null;
}) {
  const t = useT();

  const targetItem = dragTargetId ? itemMap.get(dragTargetId) : null;
  let badgeText: string | null = null;

  // 生成 badge 文字
  if (targetItem) {
    if (targetItem.type === "group-slot") {
      badgeText = t.ungroupBadge;
    } else if (ontoGroupId) {
      const g = groups.find((grp) => grp.id === ontoGroupId);
      if (g) badgeText = t.joinGroupBadge(g.name);
    } else if (dragZone === "onto") {
      badgeText = t.newGroupBadge;
    }
  }

  // 生成左侧图标
  let leftIcon: React.ReactNode = null;
  if (targetItem?.type === "group-slot") {
    leftIcon = <Folder size={14} strokeWidth={1.5} />;
  } else if (ontoGroupId) {
    const g = groups.find((grp) => grp.id === ontoGroupId);
    if (g) {
      leftIcon = <div style={{ width: 3, height: 20, background: g.color, flexShrink: 0 }} />;
    } else {
      leftIcon = <Folder size={14} strokeWidth={1.5} />;
    }
  }

  return (
    <div style={{
      width: 220, background: "var(--color-panel)", padding: "8px 12px",
      display: "flex", alignItems: "center", gap: 8, fontSize: 13,
      color: "var(--color-text)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)", pointerEvents: "none",
    }}>
      {item.type === "group-header" ? (
        // 拖拽分组头: 颜色条 + 箭头 + 名称 + 计数
        <>
          <div style={{ width: 3, height: 20, background: item.groupColor, flexShrink: 0 }} />
          <ChevronDown size={14} strokeWidth={1.5} />
          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.groupName}</span>
          <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{projects.filter((x) => x.group_id === item.groupId).length}</span>
        </>
      ) : (
        // 拖拽项目: 图标 + 名称 + 星标
        <>
          {leftIcon || <Folder size={14} strokeWidth={1.5} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.project?.name}</span>
          {item.project?.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
        </>
      )}
      {badgeText && (
        <span style={{ fontSize: 10, color: "var(--color-primary-fg)", whiteSpace: "nowrap", marginLeft: 4, padding: "1px 6px", background: "var(--color-hover)" }}>
          {badgeText}
        </span>
      )}
    </div>
  );
}
