import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/review.json";
import { adjacentMatch, findCodeMatches } from "./codeSearch";
import type { ReviewData } from "./types";

const files = (fixture as ReviewData).files;

describe("code search", () => {
  it("finds every case-insensitive occurrence in diff order", () => {
    expect(findCodeMatches(files, "CONST")).toEqual([
      { fileId: "f0", lineId: "f0:h0:l1", start: 2, end: 7 },
      { fileId: "f0", lineId: "f0:h0:l2", start: 2, end: 7 },
      { fileId: "f0", lineId: "f0:h0:l3", start: 2, end: 7 },
    ]);
    expect(findCodeMatches(files, "")).toEqual([]);
  });

  it("wraps forward and backward navigation", () => {
    expect(adjacentMatch(2, 3, 1)).toBe(0);
    expect(adjacentMatch(0, 3, -1)).toBe(2);
    expect(adjacentMatch(-1, 3, 1)).toBe(0);
    expect(adjacentMatch(-1, 3, -1)).toBe(2);
    expect(adjacentMatch(-1, 0, 1)).toBe(-1);
  });
});
