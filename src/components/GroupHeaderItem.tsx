// ============================================================================
// src/components/GroupHeaderItem.tsx
// 作用: 分组头渲染。
// grip handle 带 data-drag-handle，父组件用事件委托管理拖拽。
// ============================================================================

import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import type { TreeItem } from "../lib/store";
import type { Project } from "../lib/tauri";
import type { DragZone } from "../lib/drag";

interface GroupHeaderItemProps {
  item: TreeItem;
  isSource: boolean;
  isOnto: boolean;
  isInOntoGroup: boolean;
  ontoColor: string;
  editingGroupId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  commitRename: () => void;
  handleGroupRename: (gid: string) => void;
  toggleGroup: (id: string, collapsed: boolean) => void;
  projects: Project[];
  dragZone: DragZone;
  dragTargetId: string | null;
  itemId: string;
}

export function GroupHeaderItem({
  item, isSource, isOnto, isInOntoGroup, editingGroupId, editName,
  ontoColor, setEditName, commitRename, handleGroupRename, toggleGroup,
  projects, dragZone, dragTargetId, itemId
}: GroupHeaderItemProps) {
  const vc = projects.filter((p) => p.group_id === item.groupId).length;
  const showBefore = dragZone === "before" && dragTargetId === itemId;
  const showAfter = dragZone === "after" && dragTargetId === itemId;
  const highlight = isOnto || isInOntoGroup;

  return (
    <div className="drag-row" style={{
      position: "relative", margin: "1px 4px", display: "flex", alignItems: "center",
      background: highlight ? "var(--color-card)" : "transparent",
      opacity: isSource ? 0 : 1,
      borderLeft: item.groupColor ? `3px solid ${item.groupColor}` : "3px solid transparent",
      boxShadow: highlight ? `inset 0 0 0 2px ${ontoColor}` : "none",
      userSelect: "none",
    }}>
      {showBefore && <div className="drop-line drop-line-top" />}
      {showAfter && <div className="drop-line drop-line-bottom" />}

      {/* grip handle: data-drag-handle 让父组件捕获 pointerdown */}
      <span data-drag-handle className="drag-handle" style={{ cursor: "grab", padding: "6px 4px", display: "flex", color: "var(--color-text-muted)" }}>
        <GripVertical size={14} strokeWidth={1.5} />
      </span>

      <div onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleGroup(item.groupId!, !item.groupCollapsed); }}
        onDoubleClick={(e: React.MouseEvent) => { e.stopPropagation(); handleGroupRename(item.groupId!); }}
        style={{ flex: 1, display: "flex", alignItems: "center", padding: "6px 8px 6px 0", cursor: "pointer", gap: 4, minWidth: 0 }}>
        {item.groupCollapsed ? <ChevronRight size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
        {editingGroupId === item.id ? (
          <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename} onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditName(""); }}
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--color-hover)", color: "var(--color-text)", border: "none", padding: "2px 6px", fontSize: 13, fontWeight: 600, outline: "none", fontFamily: "inherit", width: 120 }} />
        ) : (
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.groupName}</span>
        )}
      </div>

      <span style={{ fontSize: 10, color: "var(--color-text-muted)", marginRight: 8 }}>
        {item.groupCollapsed ? `(${vc})` : `${vc}`}
      </span>
    </div>
  );
}
