import { describe, expect, it } from "vitest";
import { fileAtViewportTop } from "./scrollSpy";

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
});
