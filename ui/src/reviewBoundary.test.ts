import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/review.json";
import { reviewBoundary } from "./reviewBoundary";
import type { HistoryCommit, ReviewData } from "./types";

const review = fixture as ReviewData;
const rows: HistoryCommit[] = review.commits.map((commit) => ({ ...commit, parentIds: [], refs: [] }));
const base: HistoryCommit = { ...rows[1]!, id: review.comparison.mergeBaseId! };
const loaded = [...rows, base];

describe("review boundary", () => {
  it.each([
    ["full history", loaded, loaded, 5, 0],
    ["filtered reviewed commits", loaded, [rows[2]!], 1, 0],
    ["filtered base", loaded, [base], 0, 0],
    ["empty filter result", loaded, [], 0, 0],
    ["review section paged", rows.slice(0, 2), rows.slice(0, 2), null, 3],
    ["base row not loaded", rows, rows, 5, 0],
    ["duplicate loaded rows", [...loaded, ...rows], loaded, 5, 0],
  ] as const)("%s", (_name, loaded, visible, index, remaining) => {
    expect(reviewBoundary(review, loaded, visible)).toEqual({ label: "origin/main", index, remaining });
  });

  it("does not depend on selected commits or diff files", () => {
    for (const selectedCommitIds of [[], ["WORKTREE"], [rows[1]!.id], [rows[1]!.id, rows[2]!.id]]) {
      expect(reviewBoundary({ ...review, selectedCommitIds, files: [] }, loaded, loaded))
        .toEqual(reviewBoundary(review, loaded, loaded));
    }
  });

  it("omits a boundary for a clean base with no review commits", () => {
    expect(reviewBoundary({ ...review, commits: [], files: [] }, [base], [base])).toBeNull();
  });

  it("ends a root review at the empty tree", () => {
    const root = { ...review, commits: [rows[1]!], comparison: { ...review.comparison, mergeBaseId: null, baseRef: "empty tree" } };
    expect(reviewBoundary(root, [rows[1]!], [rows[1]!])).toEqual({ label: "empty tree", index: 1, remaining: 0 });
  });

  it("uses HEAD only for a worktree-only fallback without a known base", () => {
    const fallback = { ...review, commits: [rows[0]!], comparison: { ...review.comparison, mergeBaseId: null } };
    expect(reviewBoundary(fallback, [rows[0]!], [rows[0]!])).toEqual({ label: "HEAD", index: 1, remaining: 0 });
    expect(reviewBoundary({ ...review, comparison: fallback.comparison }, loaded, loaded)).toBeNull();
  });
});
