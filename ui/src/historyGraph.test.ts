import { describe, expect, it } from "vitest";
import { historyGraph } from "./historyGraph";

describe("historyGraph", () => {
  it("keeps a linear history in one lane", () => {
    const rows = historyGraph([
      { id: "c", parentIds: ["b"] },
      { id: "b", parentIds: ["a"] },
      { id: "a", parentIds: [] },
    ]);
    expect(rows.map((row) => row.column)).toEqual([0, 0, 0]);
    expect(rows.map((row) => row.width)).toEqual([1, 1, 1]);
    expect(rows[2]!.after).toEqual([]);
  });

  it("opens a lane for a merged branch and joins it at the fork point", () => {
    const rows = historyGraph([
      { id: "m", parentIds: ["b", "x"] },
      { id: "x", parentIds: ["a"] },
      { id: "b", parentIds: ["a"] },
      { id: "a", parentIds: [] },
    ]);
    expect(rows[0]).toMatchObject({ column: 0, after: ["b", "x"], parentColumns: [0, 1] });
    expect(rows[1]).toMatchObject({ column: 1, after: ["b", "a"], parentColumns: [1] });
    expect(rows[2]).toMatchObject({ column: 0, after: [null, "a"], parentColumns: [1] });
    expect(rows[3]).toMatchObject({ column: 1, before: [null, "a"], after: [] });
  });

  it("starts unrelated tips in a free lane", () => {
    const rows = historyGraph([
      { id: "WORKTREE", parentIds: ["b"] },
      { id: "b", parentIds: [] },
      { id: "z", parentIds: [] },
    ]);
    expect(rows.map((row) => row.column)).toEqual([0, 0, 0]);
    expect(rows[2]!.before).toEqual([]);
  });
});
