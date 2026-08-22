import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import fixture from "../__fixtures__/review.json";
import type { ReviewData } from "../types";
import { DiffView } from "./DiffView";

const files = (fixture as ReviewData).files;
const callbacks = {
  onToggleFile: vi.fn(),
  onOpenComment: vi.fn(),
  onCloseComment: vi.fn(),
  onSaveComment: vi.fn(),
  onDeleteComment: vi.fn(),
  onVisibleFile: vi.fn(),
};

describe("DiffView scroll positions", () => {
  it("starts unseen views at the top and restores each previous position", () => {
    const { rerender } = renderDiff("all");
    const pane = screen.getByRole("main", { name: "Commit diff" });
    pane.scrollTop = 420;
    fireEvent.scroll(pane);

    rerender(diff("commit-a"));
    expect(pane.scrollTop).toBe(0);
    pane.scrollTop = 85;
    fireEvent.scroll(pane);

    rerender(diff("commit-a+commit-b"));
    expect(pane.scrollTop).toBe(0);
    pane.scrollTop = 230;
    fireEvent.scroll(pane);

    rerender(diff("commit-a"));
    expect(pane.scrollTop).toBe(85);
    rerender(diff("all"));
    expect(pane.scrollTop).toBe(420);
    rerender(diff("commit-a+commit-b"));
    expect(pane.scrollTop).toBe(230);
  });

  it("uses one horizontal scroll container for each file", () => {
    renderDiff("all");

    const scrollers = files.map((file) => screen.getByLabelText(`Scrollable diff for ${file.displayPath}`));
    expect(scrollers).toHaveLength(files.length);
    for (const code of document.querySelectorAll("[data-line-id] code")) {
      expect(scrollers).toContain(code.closest("[aria-label^='Scrollable diff for ']") as HTMLElement);
    }
  });
});

function renderDiff(viewKey: string) {
  return render(diff(viewKey));
}

function diff(viewKey: string) {
  return (
    <DiffView
      viewKey={viewKey}
      files={files}
      collapsedFiles={new Set()}
      openLineId={null}
      drafts={{}}
      searchMatches={[]}
      activeSearchMatchIndex={-1}
      {...callbacks}
    />
  );
}
