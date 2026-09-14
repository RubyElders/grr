import { describe, expect, it, vi } from "vitest";
import { fileAtViewportTop, fileIndexAtViewportTop } from "./scrollSpy";

const positions = [
  { id: "first", top: -300 },
  { id: "second", top: 12 },
  { id: "third", top: 500 },
];

describe("diff scroll spy", () => {
  it("selects the last file crossing the viewport activation line", () => {
    expect(fileAtViewportTop(positions, 0, false)).toBe("second");
    expect(fileAtViewportTop(positions, -30, false)).toBe("first");
  });

  it("selects the final file at the bottom and handles an empty diff", () => {
    expect(fileAtViewportTop(positions, 0, true)).toBe("third");
    expect(fileAtViewportTop([], 0, false)).toBeNull();
  });

  it("finds a file in a large ordered list with logarithmic measurements", () => {
    const topAt = vi.fn((index: number) => index * 30 - 15_000);
    expect(fileIndexAtViewportTop(10_000, topAt, 0, false)).toBe(500);
    expect(topAt.mock.calls.length).toBeLessThan(16);
  });
});
