import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/review.json";
import { commitNavigationTarget, displayedCommits, focusedCommit, fullMessageBody } from "./commitPresentation";
import type { ReviewData } from "./types";

const data = fixture as ReviewData;

describe("commit presentation", () => {
  it("opens the latest commit from the cumulative view and returns to it", () => {
    expect(focusedCommit(data)?.id).toBe(data.commit.id);
    expect(commitNavigationTarget(data, "newer")).toBeNull();
    expect(commitNavigationTarget(data, "older")?.selectedCommitIds).toEqual(["WORKTREE"]);
    expect(commitNavigationTarget(
      { ...data, selectedCommitIds: ["WORKTREE"] },
      "newer",
    )?.selectedCommitIds).toEqual([]);
  });

  it("steps through individual commits in both directions", () => {
    const selected = { ...data, selectedCommitIds: [data.commits[2]!.id] };
    expect(commitNavigationTarget(selected, "newer")?.commit?.id).toBe(data.commits[1]?.id);
    expect(commitNavigationTarget(selected, "older")?.commit?.id).toBe(data.commits[3]?.id);
    expect(commitNavigationTarget(
      { ...data, selectedCommitIds: [data.commits.at(-1)!.id] },
      "older",
    )).toBeNull();
  });

  it("focuses one selection and leaves aggregate selections unfocused", () => {
    const single = { ...data, selectedCommitIds: [data.commits[2]!.id] };
    expect(focusedCommit(single)?.id).toBe(data.commits[2]!.id);
    expect(displayedCommits(single)).toEqual([data.commits[2]]);
    expect(focusedCommit({ ...data, selectedCommitIds: [data.commits[1]!.id, data.commits[2]!.id] })).toBeNull();
  });

  it("extracts the body from a full commit message", () => {
    expect(fullMessageBody(data.commit)).toContain("Add localized labels");
    expect(fullMessageBody(data.commits[2]!)).toBe("");
  });
});
