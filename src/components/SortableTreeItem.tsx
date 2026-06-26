// ============================================================================
// 文件 9/13: src/components/SortableTreeItem.tsx — 阅读顺序第 9 位
// 作用: 每个 TreeItem 的包装器 — 注册为 dnd-kit 可拖拽元素 + 分发到子组件
//
// 核心职责:
//   1. 调用 useSortable({ disabled: true }) 注册为拖拽源（不使用自动重排）
//   2. 根据 item.type 分发到 GroupSlotItem / GroupHeaderItem / ProjectItem
//   3. 管理可见性（折叠/过滤的项渲染为隐藏占位）
//
// useSortable: 返回 {ref, handleRef, isDragSource}
//   ref         → 绑到最外层 div，dnd-kit 用这个测量元素位置
//   handleRef   → 绑到拖拽手柄，PointerSensor 监听这个元素的 pointer down 事件
//   isDragSource → 布尔值，当前是否正在被拖拽（用于禁用点击）
// ============================================================================

import type { DragDropManager } from "@dnd-kit/dom";
import { Modifier } from "@dnd-kit/abstract";
import { useSortable } from "@dnd-kit/react/sortable";
import type { TreeItem } from "../lib/store";
import type { Project } from "../lib/tauri";
import type { DragZone } from "../lib/drag";
import { GroupSlotItem } from "./GroupSlotItem";
import { GroupHeaderItem } from "./GroupHeaderItem";
import { ProjectItem } from "./ProjectItem";

// RestrictToVertical: 限制拖拽只能沿 Y 轴移动
class RestrictToVertical extends Modifier<DragDropManager> {
  constructor(manager: DragDropManager) { super(manager); }
  apply({ transform }: DragDropManager["dragOperation"]) {
    return { x: 0, y: transform.y };  // X 轴锁死为 0
  }
}

interface SortableTreeItemProps {
  id: string; index: number; item: TreeItem; visible: boolean;
  activeId: string | null; dragZone: DragZone; dragTargetId: string | null;
  ontoGroupId: string | null; savedSelected: string | null; filterActive: boolean;
  editingGroupId: string | null; editName: string; setEditName: (v: string) => void;
  commitRename: () => void; handleGroupRename: (gid: string) => void;
  toggleGroup: (id: string, collapsed: boolean) => void;
  selectProject: (id: string | null) => void; projects: Project[];
}

export function SortableTreeItem({
  id, index, item, visible, activeId, dragZone, dragTargetId, ontoGroupId,
  savedSelected, filterActive, editingGroupId, editName, setEditName,
  commitRename, handleGroupRename, toggleGroup, selectProject, projects
}: SortableTreeItemProps) {

  // disabled = true 时: 元素仍可被拖拽，但不会参与 dnd-kit 自动重排
  const disabled = !visible || filterActive;

  const { ref, handleRef, isDragSource } = useSortable({
    id, index, disabled,
    modifiers: [RestrictToVertical],
  });
  const isSource = activeId === id;  // 当前是否正在被拖拽

  // 不可见项: 渲染为高度 0 的占位（不能完全移除，否则 useSortable 找不到元素）
  if (!visible) {
    return (
      <div ref={ref} style={{ visibility: "hidden", height: 0, overflow: "hidden", margin: 0, padding: 0, border: "none", pointerEvents: "none" }}>
        <span ref={handleRef} />
      </div>
    );
  }

  // 幽灵槽位
  if (item.type === "group-slot") {
    return (
      <div ref={ref} data-dnd-item-id={id}>
        <span ref={handleRef} style={{ display: "none" }} />
        <GroupSlotItem isOnto={dragZone === "onto" && dragTargetId === id} />
      </div>
    );
  }

  // 分组头
  if (item.type === "group-header") {
    const isOntoTarget = dragZone === "onto" && dragTargetId === id;
    const isInOntoGroup = !!ontoGroupId && item.groupId === ontoGroupId;
    return (
      <div ref={ref} data-dnd-item-id={id}>
        <GroupHeaderItem ref_handle={handleRef} item={item} isSource={isSource}
          isOnto={isOntoTarget} isInOntoGroup={isInOntoGroup}
          editingGroupId={editingGroupId} editName={editName} setEditName={setEditName}
          commitRename={commitRename} handleGroupRename={handleGroupRename}
          toggleGroup={toggleGroup} isDragSource={isDragSource}
          projects={projects} dragZone={dragZone} dragTargetId={dragTargetId} itemId={id} />
      </div>
    );
  }

  // 普通项目
  const p: Project = item.project!;
  const isOntoTarget = dragZone === "onto" && dragTargetId === id;
  const isInOntoGroup = !!ontoGroupId && (
    item.project?.group_id === ontoGroupId ||
    (dragZone === "onto" && dragTargetId === id && !item.project?.group_id)
  );
  return (
    <div ref={ref} data-dnd-item-id={id}>
      <ProjectItem item={item} project={p} isSource={isSource} isOnto={isOntoTarget}
        isInOntoGroup={isInOntoGroup} handleRef={handleRef} savedSelected={savedSelected}
        itemId={id} isDragSource={isDragSource} selectProject={selectProject}
        filterActive={filterActive} dragZone={dragZone} dragTargetId={dragTargetId} />
    </div>
  );
}
