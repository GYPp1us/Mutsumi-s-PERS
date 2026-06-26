import { Folder, Star, ChevronDown } from "lucide-react";
import { useT } from "../lib/i18n";
import type { TreeItem } from "../lib/store";
import type { GroupInfo, Project } from "../lib/tauri";
import type { DragZone } from "../lib/drag";

export function OverlayCard({ item, ontoGroupId, dragZone, groups, projects, itemMap, dragTargetId }: {
  item: TreeItem;
  ontoGroupId: string | null;
  dragZone: DragZone;
  groups: GroupInfo[];
  projects: Project[];
  itemMap: Map<string, TreeItem>;
  dragTargetId: string | null;
}) {
  const t = useT();
  if (!item) return null;

  const targetItem = dragTargetId ? itemMap.get(dragTargetId) : null;
  let badgeText: string | null = null;

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
    <div style={{ width: 220, background: "var(--color-panel)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-text)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)", pointerEvents: "none" }}>
      {item.type === "group-header" ? (
        <>
          <div style={{ width: 3, height: 20, background: item.groupColor, flexShrink: 0 }} />
          <ChevronDown size={14} strokeWidth={1.5} />
          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.groupName}</span>
          <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{projects.filter((x) => x.group_id === item.groupId).length}</span>
        </>
      ) : (
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
