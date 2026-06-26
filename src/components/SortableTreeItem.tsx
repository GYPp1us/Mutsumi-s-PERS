import type { DragDropManager } from "@dnd-kit/dom";
import { Modifier } from "@dnd-kit/abstract";
import { useSortable } from "@dnd-kit/react/sortable";
import type { TreeItem } from "../lib/store";
import type { Project } from "../lib/tauri";
import type { DragZone } from "../lib/drag";
import { GroupSlotItem } from "./GroupSlotItem";
import { GroupHeaderItem } from "./GroupHeaderItem";
import { ProjectItem } from "./ProjectItem";

class RestrictToVertical extends Modifier<DragDropManager> {
  constructor(manager: DragDropManager) {
    super(manager);
  }
  apply({ transform }: DragDropManager["dragOperation"]) {
    return { x: 0, y: transform.y };
  }
}

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

export function SortableTreeItem({ id, index, item, visible, activeId, dragZone, dragTargetId, ontoGroupId, savedSelected, filterActive,
  editingGroupId, editName, setEditName, commitRename, handleGroupRename, toggleGroup, selectProject, projects }: SortableTreeItemProps) {

  const disabled = !visible || filterActive;

  const { ref, handleRef, isDragSource } = useSortable({
    id, index,
    disabled,
    modifiers: [RestrictToVertical],
  });
  const isSource = activeId === id;

  if (!visible) {
    return (
      <div ref={ref} style={{ visibility: "hidden", height: 0, overflow: "hidden", margin: 0, padding: 0, border: "none", pointerEvents: "none" }}>
        <span ref={handleRef} />
      </div>
    );
  }

  if (item.type === "group-slot") {
    return (
      <div ref={ref} data-dnd-item-id={id}>
        <span ref={handleRef} style={{ display: "none" }} />
        <GroupSlotItem isOnto={dragZone === "onto" && dragTargetId === id} />
      </div>
    );
  }

  if (item.type === "group-header") {
    const isOntoTarget = dragZone === "onto" && dragTargetId === id;
    const isInOntoGroup = !!ontoGroupId && item.groupId === ontoGroupId;
    return (
      <div ref={ref} data-dnd-item-id={id}>
        <GroupHeaderItem ref_handle={handleRef} item={item} isSource={isSource} isOnto={isOntoTarget}
          isInOntoGroup={isInOntoGroup}
          editingGroupId={editingGroupId} editName={editName} setEditName={setEditName}
          commitRename={commitRename} handleGroupRename={handleGroupRename}
          toggleGroup={toggleGroup} isDragSource={isDragSource}
          projects={projects} dragZone={dragZone} dragTargetId={dragTargetId} itemId={id} />
      </div>
    );
  }

  const p: Project = item.project!;
  const isOntoTarget = dragZone === "onto" && dragTargetId === id;
  const isInOntoGroup = !!ontoGroupId && (item.project?.group_id === ontoGroupId || (dragZone === "onto" && dragTargetId === id && !item.project?.group_id));
  return (
    <div ref={ref} data-dnd-item-id={id}>
      <ProjectItem item={item} project={p} isSource={isSource} isOnto={isOntoTarget}
        isInOntoGroup={isInOntoGroup}
        handleRef={handleRef} savedSelected={savedSelected} itemId={id}
        isDragSource={isDragSource} selectProject={selectProject}
        filterActive={filterActive} dragZone={dragZone} dragTargetId={dragTargetId} />
    </div>
  );
}
