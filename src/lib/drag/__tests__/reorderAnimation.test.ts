import { describe, expect, it } from "vitest";
import { getReorderAnimationDelta } from "../reorderAnimation";

describe("reorder animation deltas", () => {
  it("uses layout positions to compute the FLIP delta", () => {
    expect(getReorderAnimationDelta(120, 72)).toBe(48);
    expect(getReorderAnimationDelta(72, 120)).toBe(-48);
  });

  it("skips unchanged or subpixel layout changes", () => {
    expect(getReorderAnimationDelta(120, 120)).toBeNull();
    expect(getReorderAnimationDelta(120, 120.5)).toBeNull();
  });

  it("skips implausibly large deltas instead of flinging rows out of view", () => {
    expect(getReorderAnimationDelta(0, 520)).toBeNull();
  });

  it("treats one pixel and the configured max delta as valid boundaries", () => {
    expect(getReorderAnimationDelta(101, 100)).toBe(1);
    expect(getReorderAnimationDelta(420, 100)).toBe(320);
    expect(getReorderAnimationDelta(421, 100)).toBeNull();
    expect(getReorderAnimationDelta(180, 100, 80)).toBe(80);
    expect(getReorderAnimationDelta(181, 100, 80)).toBeNull();
  });
});
