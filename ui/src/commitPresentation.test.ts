import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/review.json";
import { adjacentCommit, displayedCommits, focusedCommit, fullMessageBody } from "./commitPresentation";
import type { ReviewData } from "./types";

const data = fixture as ReviewData;

describe("commit presentation", () => {
  it("anchors the cumulative view on HEAD and navigates newer or older", () => {
    expect(focusedCommit(data)?.id).toBe(data.commit.id);
    expect(adjacentCommit(data, "newer")?.id).toBe("WORKTREE");
    expect(adjacentCommit(data, "older")?.id).toBe(data.commits[2]?.id);
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
