import { describe, expect, it } from "vitest";
import { consecutiveCommitIds, toggleCommitRange } from "./commitRange";
import type { CommitSummary } from "./types";

const commit = (id: string, parentId: string | null): CommitSummary => ({
  id, parentId, shortId: id, summary: id, message: id, author: "Author", authoredAt: 0,
});
const commits = [commit("WORKTREE", "c"), commit("c", "b"), commit("b", "a"), commit("a", null)];

describe("consecutive commit ranges", () => {
  it("includes intervening commits regardless of endpoint order or duplicates", () => {
    expect(consecutiveCommitIds(commits, ["a", "c", "a"])).toEqual(["c", "b", "a"]);
  });
  it("includes HEAD and every intervening commit when selecting the worktree", () => {
    expect(consecutiveCommitIds(commits, ["a", "WORKTREE"])).toEqual(["WORKTREE", "c", "b", "a"]);
  });
  it("keeps singleton and empty selections", () => {
    expect(consecutiveCommitIds(commits, ["b"])).toEqual(["b"]);
    expect(consecutiveCommitIds(commits, [])).toEqual([]);
  });
  it("extends endpoints and trims without leaving holes", () => {
    expect(toggleCommitRange(commits, ["c"], "a")).toEqual(["c", "b", "a"]);
    expect(toggleCommitRange(commits, ["c", "b", "a"], "b")).toEqual(["c"]);
    expect(toggleCommitRange(commits, ["c", "b"], "c")).toEqual(["b"]);
    expect(toggleCommitRange(commits, ["b"], "b")).toEqual([]);
  });
  it("rejects endpoints on different first-parent histories", () => {
    expect(() => consecutiveCommitIds([...commits, commit("branch", "a")], ["c", "branch"])).toThrow("first-parent");
  });
});
