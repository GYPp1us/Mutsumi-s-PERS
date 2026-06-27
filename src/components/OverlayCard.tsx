import { ChevronDown, Folder, Star } from "lucide-react";
import { useT } from "../lib/i18n";
import type { TreeItem } from "../lib/store";
import type { GroupInfo, Project } from "../lib/tauri";
import type { DragZone } from "../lib/drag";

interface OverlayCardProps {
  item: TreeItem;
  ontoGroupId: string | null;
  dragZone: DragZone;
  groups: GroupInfo[];
  projects: Project[];
  itemMap: Map<string, TreeItem>;
  dragTargetId: string | null;
}

export function OverlayCard({
  item,
  ontoGroupId,
  dragZone,
  groups,
  projects,
  itemMap,
  dragTargetId,
}: OverlayCardProps) {
  const t = useT();
  const targetItem = dragTargetId ? itemMap.get(dragTargetId) : null;
  const badgeText = getBadgeText(targetItem, ontoGroupId, dragZone, groups, t);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        background: "var(--color-panel)",
        color: "var(--color-text)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.28)",
        pointerEvents: "none",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {item.type === "group-header" ? (
        <GroupOverlayRow item={item} projects={projects} badgeText={badgeText} />
      ) : (
        <ProjectOverlayRow item={item} badgeText={badgeText} />
      )}
    </div>
  );
}

function ProjectOverlayRow({ item, badgeText }: { item: TreeItem; badgeText: string | null }) {
  const project = item.project;
  return (
    <div
      style={{
        height: "100%",
        minHeight: 52,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: item.isGrouped ? "7px 14px 7px 18px" : "8px 14px",
      }}
    >
      <span style={{ width: 14, height: 14, flexShrink: 0 }} />
      <Folder size={14} strokeWidth={1.5} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "var(--color-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {project?.name}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {project?.path}
        </div>
      </div>
      {project?.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
      <Badge text={badgeText} />
    </div>
  );
}

function GroupOverlayRow({
  item,
  projects,
  badgeText,
}: {
  item: TreeItem;
  projects: Project[];
  badgeText: string | null;
}) {
  const count = projects.filter((project) => project.group_id === item.groupId).length;

  return (
    <div
      style={{
        height: "100%",
        minHeight: 34,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 8px",
      }}
    >
      <span style={{ width: 14, height: 14, flexShrink: 0 }} />
      <ChevronDown size={14} strokeWidth={1.5} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontWeight: 600,
          fontSize: 13,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.groupName}
      </span>
      <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{count}</span>
      <Badge text={badgeText} />
    </div>
  );
}

function Badge({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <span
      style={{
        fontSize: 10,
        color: "var(--color-primary-fg)",
        whiteSpace: "nowrap",
        marginLeft: 4,
        padding: "1px 6px",
        background: "var(--color-hover)",
      }}
    >
      {text}
    </span>
  );
}

function getBadgeText(
  targetItem: TreeItem | null | undefined,
  ontoGroupId: string | null,
  dragZone: DragZone,
  groups: GroupInfo[],
  t: ReturnType<typeof useT>
): string | null {
  if (!targetItem) return null;
  if (targetItem.type === "group-slot") return t.ungroupBadge;
  if (ontoGroupId) {
    const group = groups.find((candidate) => candidate.id === ontoGroupId);
    return group ? t.joinGroupBadge(group.name) : null;
  }
  return dragZone === "onto" ? t.newGroupBadge : null;
}
