export type ProjectContextMenuItemId = "toggle-star" | "delete";

export interface ProjectContextMenuLabels {
  star: string;
  unstar: string;
  delete: string;
}

export interface ProjectContextMenuItem {
  id: ProjectContextMenuItemId;
  label: string;
  destructive: boolean;
}

export function getProjectContextMenuItems(
  starred: boolean,
  labels: ProjectContextMenuLabels
): ProjectContextMenuItem[] {
  return [
    {
      id: "toggle-star",
      label: starred ? labels.unstar : labels.star,
      destructive: false,
    },
    {
      id: "delete",
      label: labels.delete,
      destructive: true,
    },
  ];
}
