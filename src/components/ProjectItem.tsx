// ============================================================================
// src/components/ProjectItem.tsx
// 作用: 单项目渲染。
// grip handle 带 data-drag-handle，父组件用事件委托管理拖拽。
// ============================================================================

import { Folder, Star, GripVertical } from "lucide-react";
import type { TreeItem } from "../lib/store";
import type { Project } from "../lib/tauri";
import type { DragZone } from "../lib/drag";

interface ProjectItemProps {
  item: TreeItem;
  project: Project;
  isSource: boolean;
  isOnto: boolean;
  isInOntoGroup: boolean;
  ontoColor: string;
  savedSelected: string | null;
  itemId: string;
  selectProject: (id: string | null) => void;
  filterActive: boolean;
  dragZone: DragZone;
  dragTargetId: string | null;
}

export function ProjectItem({
  item, project: p, isSource, isOnto, isInOntoGroup,
  ontoColor, savedSelected, itemId, selectProject, filterActive,
  dragZone, dragTargetId
}: ProjectItemProps) {
  const isGrouped = item.isGrouped;
  const groupColor = item.groupColor;
  const sel = savedSelected === itemId;
  const showBefore = dragZone === "before" && dragTargetId === itemId;
  const showAfter = dragZone === "after" && dragTargetId === itemId;
  const highlight = isOnto || isInOntoGroup;

  return (
    <div style={{ position: "relative" }}>
      {showBefore && <div className="drop-line drop-line-top" />}
      {showAfter && <div className="drop-line drop-line-bottom" />}

      <div className="drag-row" style={{
        padding: "0 14px 0 0",
        margin: "1px 4px", display: "flex", alignItems: "stretch", gap: 4,
        cursor: filterActive ? "pointer" : "default",
        background: sel ? "var(--color-hover)" : (highlight ? "var(--color-card)" : "transparent"),
        borderLeft: isGrouped ? `3px solid ${groupColor || "transparent"}` : "3px solid transparent",
        opacity: isSource ? 0 : 1,
        boxShadow: highlight
          ? `inset 0 0 0 2px ${ontoColor}`
          : "none",
        userSelect: "none",
      }}
        onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { if (sel !== true && !highlight) e.currentTarget.style.background = "var(--color-card)"; }}
        onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { if (sel !== true && !highlight) e.currentTarget.style.background = "transparent"; }}
      >
        {/* grip handle: data-drag-handle 让父组件通过事件委托捕获 pointerdown */}
        <span data-drag-handle className="drag-handle" style={{ cursor: "grab", display: "flex", alignItems: "center", padding: "0 4px", color: "var(--color-text-muted)" }}>
          <GripVertical size={14} strokeWidth={1.5} />
        </span>

        <div onClick={() => selectProject(itemId)}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: isGrouped ? "7px 0 7px 0" : "8px 0" }}>
          <Folder size={14} strokeWidth={1.5} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: sel ? 600 : 400 }}>{p.name}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.path}</div>
          </div>
          {p.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
        </div>
      </div>
    </div>
  );
}
