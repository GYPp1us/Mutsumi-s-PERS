import { describe, expect, it } from "vitest";
import { getProjectContextMenuItems } from "../projectContextMenu";

describe("getProjectContextMenuItems", () => {
  it("shows star and delete for an unstarred project", () => {
    const items = getProjectContextMenuItems(false, {
      star: "Star",
      unstar: "Unstar",
      delete: "Delete",
    });

    expect(items).toEqual([
      { id: "toggle-star", label: "Star", destructive: false },
      { id: "delete", label: "Delete", destructive: true },
    ]);
  });

  it("shows unstar and delete for a starred project", () => {
    const items = getProjectContextMenuItems(true, {
      star: "Star",
      unstar: "Unstar",
      delete: "Delete",
    });

    expect(items).toEqual([
      { id: "toggle-star", label: "Unstar", destructive: false },
      { id: "delete", label: "Delete", destructive: true },
    ]);
  });
});
