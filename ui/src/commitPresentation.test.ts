import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/review.json";
import { commitContext, commitNavigationTarget, displayedCommits, fullMessageBody, hasGroupedCommitView, summarizeCommitAuthors } from "./commitPresentation";
import type { ReviewData } from "./types";

const data = fixture as ReviewData;

describe("commit presentation", () => {
  it("opens the latest commit from the cumulative view and returns to it", () => {
    expect(commitContext(data)).toMatchObject({
      ref: "range",
      title: "5 commits against origin/main",
      authors: "Local working tree (1), Local User (4)",
      message: "Virtual commit range.",
    });
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

  it("resolves individual and selected-range contexts", () => {
    const single = { ...data, selectedCommitIds: [data.commits[2]!.id] };
    expect(commitContext(single)).toMatchObject({
      id: data.commits[2]!.id,
      ref: data.commits[2]!.shortId,
      title: data.commits[2]!.summary,
      authors: data.commits[2]!.author,
    });
    expect(displayedCommits(single)).toEqual([data.commits[2]]);
    expect(commitContext({ ...data, selectedCommitIds: [data.commits[1]!.id, data.commits[2]!.id] })).toMatchObject({
      ref: "range",
      title: "2 selected commits",
      authors: "Local User (2)",
      message: "Virtual commit range.",
    });
  });

  it("does not create a grouped view for zero or one commit", () => {
    const one = { ...data, commits: [data.commits[0]!] };
    const selected = { ...one, selectedCommitIds: [one.commits[0]!.id] };
    const empty = { ...data, commits: [], selectedCommitIds: [] };

    expect(hasGroupedCommitView(one)).toBe(false);
    expect(commitNavigationTarget(one, "older")).toBeNull();
    expect(commitNavigationTarget(selected, "newer")).toBeNull();
    expect(commitContext(empty)).toBeNull();
    expect(commitNavigationTarget(empty, "older")).toBeNull();
  });

  it("extracts the body from a full commit message", () => {
    expect(fullMessageBody(data.commit)).toContain("Add localized labels");
    expect(fullMessageBody(data.commits[2]!)).toBe("");
  });

  it("deduplicates range authors and counts their commits", () => {
    expect(summarizeCommitAuthors(data.commits)).toBe("Local working tree (1), Local User (4)");
    expect(summarizeCommitAuthors([data.commits[1]!, data.commits[0]!])).toBe("Local User (1), Local working tree (1)");
  });
});
