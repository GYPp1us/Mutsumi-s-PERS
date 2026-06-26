// ============================================================================
// 文件 11/13: src/components/ProjectItem.tsx
// 作用: 单个项目的渲染 — 文件夹图标 + 名称 + 路径 + 收藏星标
// 拖拽时显示: before/after 横线、onto/分组高亮、拖拽源时透明
// ============================================================================

import { Folder, Star, GripVertical } from "lucide-react";
import type { TreeItem } from "../lib/store";
import type { Project } from "../lib/tauri";
import type { DragZone } from "../lib/drag";

interface ProjectItemProps {
  item: TreeItem; project: Project;
  isSource: boolean; isOnto: boolean; isInOntoGroup: boolean;
  handleRef: (el: Element | null) => void;  // 从 useSortable 传来的拖拽手柄 ref
  savedSelected: string | null; itemId: string; isDragSource: boolean;
  selectProject: (id: string | null) => void; filterActive: boolean;
  dragZone: DragZone; dragTargetId: string | null;
}

export function ProjectItem({
  item, project: p, isSource, isOnto, isInOntoGroup, handleRef,
  savedSelected, itemId, isDragSource, selectProject, filterActive,
  dragZone, dragTargetId
}: ProjectItemProps) {
  const isGrouped = item.isGrouped;     // 属于分组 → 缩进 + 彩色左边框
  const groupColor = item.groupColor;
  const sel = savedSelected === itemId;  // 当前选中项
  const showBefore = dragZone === "before" && dragTargetId === itemId;
  const showAfter = dragZone === "after" && dragTargetId === itemId;
  const highlight = isOnto || isInOntoGroup;

  return (
    <div style={{ position: "relative" }}>
      {/* Drop lines: 边缘拖拽指示线 */}
      {showBefore && <div className="drop-line drop-line-top" />}
      {showAfter && <div className="drop-line drop-line-bottom" />}

      <div style={{
        padding: isGrouped ? "7px 14px 7px 18px" : "8px 14px",  // 分组内缩进
        margin: "1px 4px", display: "flex", alignItems: "center", gap: 4,
        cursor: filterActive ? "pointer" : "default",  // 过滤模式下不可拖拽，恢复点击选择
        background: sel ? "var(--color-hover)" : (highlight ? "var(--color-card)" : "transparent"),
        borderLeft: sel
          ? "2px solid var(--color-primary)"
          : (isGrouped ? `3px solid ${groupColor || "transparent"}` : "2px solid transparent"),
        opacity: isSource ? 0 : 1,                        // 拖拽源 → 隐藏
        boxShadow: highlight
          ? `inset 0 0 0 2px ${isGrouped ? groupColor : "var(--color-primary)"}`
          : "none",
        userSelect: "none",
      }}
        onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { if (sel !== true && !highlight) e.currentTarget.style.background = "var(--color-card)"; }}
        onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { if (sel !== true && !highlight) e.currentTarget.style.background = "transparent"; }}
      >
        {/* 拖拽手柄 */}
        <span ref={handleRef} style={{ cursor: "grab", display: "flex", color: "var(--color-text-muted)", opacity: 0.5 }}>
          <GripVertical size={14} strokeWidth={1.5} />
        </span>

        {/* 项目内容（点击选中） */}
        <div onClick={() => { if (!isDragSource) selectProject(itemId); }}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <Folder size={14} strokeWidth={1.5} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{p.name}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.path}</div>
          </div>
          {p.starred && <Star size={12} strokeWidth={1.5} color="var(--color-warning)" />}
        </div>
      </div>
    </div>
  );
}
