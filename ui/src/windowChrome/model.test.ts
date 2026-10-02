import { describe, expect, it } from "vitest";
import fixture from "../__fixtures__/review.json";
import { windowChromeUpdate } from "./model";
import type { ReviewData } from "../types";

describe("windowChromeUpdate", () => {
  it("presents the grouped comparison and its available navigation", () => {
    expect(windowChromeUpdate(fixture as ReviewData, false)).toEqual({
      title: "5 commits against origin/main",
      subtitle: "virtual by Local working tree (1), Local User (4)",
      canNavigateNewer: false,
      canNavigateOlder: true,
      commitSelectionEnabled: true,
    });
  });

  it("presents a single commit and disables every commit action together", () => {
    const data = { ...(fixture as ReviewData), selectedCommitIds: ["WORKTREE"] };
    expect(windowChromeUpdate(data, true)).toEqual({
      title: "Uncommitted changes",
      subtitle: "worktree by Local working tree",
      canNavigateNewer: false,
      canNavigateOlder: false,
      commitSelectionEnabled: false,
    });
  });
});
