// ============================================================================
// src/components/SortableTreeItem.tsx
// 作用: TreeItem 分发器 — 根据 type 渲染 GroupSlotItem / GroupHeaderItem / ProjectItem
// 注意: 不再依赖 dnd-kit。拖拽由父组件 ProjectList 通过 pointer 事件管理。
//       每个 grip handle 带 data-drag-handle 属性，父组件用事件委托捕获。
//       data-dnd-item-id 保留，用于高度快照查询和选中逻辑。
// ============================================================================

import type { TreeItem } from "../lib/store";
import type { Project } from "../lib/tauri";
import type { DragZone } from "../lib/drag";
import { GroupSlotItem } from "./GroupSlotItem";
import { GroupHeaderItem } from "./GroupHeaderItem";
import { ProjectItem } from "./ProjectItem";

interface SortableTreeItemProps {
  id: string;
  index: number;
  item: TreeItem;
  visible: boolean;
  activeId: string | null;
  dragZone: DragZone;
  dragTargetId: string | null;
  ontoGroupId: string | null;
  savedSelected: string | null;
  filterActive: boolean;
  editingGroupId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  commitRename: () => void;
  handleGroupRename: (gid: string) => void;
  toggleGroup: (id: string, collapsed: boolean) => void;
  selectProject: (id: string | null) => void;
  projects: Project[];
}

export function SortableTreeItem({
  id, item, visible, activeId, dragZone, dragTargetId, ontoGroupId,
  savedSelected, filterActive, editingGroupId, editName, setEditName,
  commitRename, handleGroupRename, toggleGroup, selectProject, projects
}: SortableTreeItemProps) {

  const isSource = activeId === id;

  if (!visible) {
    return (
      <div data-dnd-item-id={id} style={{ visibility: "hidden", height: 0, overflow: "hidden", margin: 0, padding: 0, border: "none", pointerEvents: "none" }} />
    );
  }

  if (item.type === "group-slot") {
    return (
      <div data-dnd-item-id={id} className="drag-item">
        <GroupSlotItem isOnto={dragZone === "onto" && dragTargetId === id} />
      </div>
    );
  }

  if (item.type === "group-header") {
    const isOntoTarget = dragZone === "onto" && dragTargetId === id;
    const isInOntoGroup = !!ontoGroupId && item.groupId === ontoGroupId;
    return (
      <div data-dnd-item-id={id} className="drag-item">
        <GroupHeaderItem item={item} isSource={isSource} isOnto={isOntoTarget}
          isInOntoGroup={isInOntoGroup}
          editingGroupId={editingGroupId} editName={editName} setEditName={setEditName}
          commitRename={commitRename} handleGroupRename={handleGroupRename}
          toggleGroup={toggleGroup}
          projects={projects} dragZone={dragZone} dragTargetId={dragTargetId} itemId={id} />
      </div>
    );
  }

  const p: Project = item.project!;
  const isOntoTarget = dragZone === "onto" && dragTargetId === id;
  const isInOntoGroup = !!ontoGroupId && (
    item.project?.group_id === ontoGroupId ||
    (dragZone === "onto" && dragTargetId === id && !item.project?.group_id)
  );
  return (
    <div data-dnd-item-id={id} className="drag-item">
      <ProjectItem item={item} project={p} isSource={isSource} isOnto={isOntoTarget}
        isInOntoGroup={isInOntoGroup} savedSelected={savedSelected} itemId={id}
        selectProject={selectProject}
        filterActive={filterActive} dragZone={dragZone} dragTargetId={dragTargetId} />
    </div>
  );
}
