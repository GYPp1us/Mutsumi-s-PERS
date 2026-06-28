import { describe, expect, it } from "vitest";
import {
  getDropAnimationTarget,
  getDropAnimationTargetFromPreview,
  isDropOverlayHighlighted,
} from "../dropAnimation";

describe("drop animation target", () => {
  it("skips animation when overlay or target is missing", () => {
    expect(getDropAnimationTarget(null, { x: 10, y: 20 })).toBeNull();
    expect(getDropAnimationTarget({ x: 10, y: 20 }, null)).toBeNull();
  });

  it("skips animation when the overlay is already at the target", () => {
    expect(getDropAnimationTarget({ x: 10, y: 20 }, { x: 10.5, y: 20.5 })).toBeNull();
  });

  it("returns the target when the overlay needs to settle into place", () => {
    expect(getDropAnimationTarget({ x: 10, y: 20 }, { x: 10, y: 48 })).toEqual({ x: 10, y: 48 });
  });

  it("settles to the source row in the preview tree", () => {
    expect(getDropAnimationTargetFromPreview({
      sourceId: "project-1",
      targetId: "project-2",
      previewIds: ["group-1", "project-2", "project-1"],
      rowTops: new Map([["group-1", 0], ["project-2", 34], ["project-1", 86]]),
      overlay: { x: 20, y: 200 },
      baseX: 20,
      containerTop: 100,
      contentOffsetTop: 40,
      scrollTop: 10,
    })).toEqual({ x: 20, y: 216 });
  });

  it("skips settle when the source has no preview row", () => {
    expect(getDropAnimationTargetFromPreview({
      sourceId: "project-1",
      targetId: "project-2",
      previewIds: ["project-2"],
      rowTops: new Map([["project-2", 0]]),
      overlay: { x: 20, y: 200 },
      baseX: 20,
      containerTop: 100,
      contentOffsetTop: 0,
      scrollTop: 0,
    })).toBeNull();
  });
});

describe("drop overlay highlight", () => {
  it("highlights drag-out slots", () => {
    expect(isDropOverlayHighlighted({
      sourceItemType: "project",
      targetId: "slot-group-1",
      targetItemType: "group-slot",
      zone: "onto",
      ontoGroupId: null,
    })).toBe(true);
  });

  it("highlights join-group and create-group interactions", () => {
    expect(isDropOverlayHighlighted({
      sourceItemType: "project",
      targetId: "project-2",
      targetItemType: "project",
      zone: "after",
      ontoGroupId: "group-1",
    })).toBe(true);
    expect(isDropOverlayHighlighted({
      sourceItemType: "project",
      targetId: "project-2",
      targetItemType: "project",
      zone: "onto",
      ontoGroupId: null,
    })).toBe(true);
  });

  it("does not highlight group block drags or plain reorder zones", () => {
    expect(isDropOverlayHighlighted({
      sourceItemType: "group-header",
      targetId: "project-2",
      targetItemType: "project",
      zone: "onto",
      ontoGroupId: "group-1",
    })).toBe(false);
    expect(isDropOverlayHighlighted({
      sourceItemType: "project",
      targetId: "project-2",
      targetItemType: "project",
      zone: "before",
      ontoGroupId: null,
    })).toBe(false);
  });
});
