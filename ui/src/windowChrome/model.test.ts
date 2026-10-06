import { describe, expect, it, vi } from "vitest";
import fixture from "../__fixtures__/review.json";
import { isWindowChromeKind, windowChromeCapabilities, windowChromeTooltips, windowChromeUpdate } from "./model";
import type { ReviewData } from "../types";

describe("window chrome capabilities", () => {
  it.each([
    ["gtk-native", true, false, false],
    ["mac-native", true, false, false],
    ["windows-native", false, true, true],
    ["html", false, false, false],
  ] as const)("describes %s", (kind, nativeHeader, customCaptionButtons, systemMenu) => {
    expect(isWindowChromeKind(kind)).toBe(true);
    expect(windowChromeCapabilities(kind)).toEqual({ nativeHeader, customCaptionButtons, systemMenu });
  });

  it.each(["unknown", "toString", null, {}])("rejects unsupported chrome values: %s", (kind) => {
    expect(isWindowChromeKind(kind)).toBe(false);
  });
});

describe("windowChromeUpdate", () => {
  it("uses the shortcut registry for native header tooltips on each platform", () => {
    expect(windowChromeTooltips().sidebar).toBe("Toggle the file sidebar (Ctrl + B)");
    const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    try {
      expect(windowChromeTooltips().sidebar).toBe("Toggle the file sidebar (⌘B)");
      expect(windowChromeTooltips().picker).toBe("Browse commits (c)");
    } finally {
      platform.mockRestore();
    }
  });

  it("presents the grouped comparison and its available navigation", () => {
    expect(windowChromeUpdate(fixture as ReviewData, false)).toEqual({
      title: "5 commits against origin/main",
      subtitle: "virtual by Local working tree (1), Local User (4)",
      canNavigateNewer: false,
      canNavigateOlder: true,
      commitSelectionEnabled: true,
      tooltips: windowChromeTooltips(),
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
      tooltips: windowChromeTooltips(),
    });
  });
});
