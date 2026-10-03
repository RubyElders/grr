import { act, fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import fixture from "../__fixtures__/review.json";
import type { FileDiff, ReviewData } from "../types";
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

  it("shows a pure rename as a file movement instead of a metadata change", () => {
    const movedFile: FileDiff = {
      ...files[0]!,
      id: "moved-file",
      oldPath: "src/old-name.rs",
      newPath: "src/new-name.rs",
      displayPath: "src/new-name.rs",
      status: "renamed",
      oldMode: "100644",
      newMode: "100644",
      oldOid: "1111111111111111111111111111111111111111",
      newOid: "1111111111111111111111111111111111111111",
      binary: false,
      additions: 0,
      deletions: 0,
      hunks: [],
    };
    render(
      <DiffView
        viewKey="move"
        files={[movedFile]}
        activeFileId={movedFile.id}
        showSourceCommits={false}
        collapsedFiles={new Set()}
        openLineId={null}
        drafts={{}}
        searchMatches={[]}
        activeSearchMatchIndex={-1}
        {...callbacks}
      />,
    );

    expect(screen.getByText("File moved")).toBeInTheDocument();
    expect(screen.getByText("src/old-name.rs -> src/new-name.rs")).toBeInTheDocument();
    expect(screen.queryByText("File metadata changed")).not.toBeInTheDocument();
    expect(screen.queryByText("100644 -> 100644")).not.toBeInTheDocument();
  });

  it("mounts diff contents only near the viewport when observation is available", () => {
    let notify: IntersectionObserverCallback = () => undefined;
    class TestIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds = [];
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      disconnect() {}
      observe() {}
      takeRecords() { return []; }
      unobserve() {}
    }
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    const manyFiles = Array.from({ length: 20 }, (_, index) => ({
      ...files[0]!,
      id: `large:f${index}`,
      displayPath: `src/file-${index}.rs`,
      hunks: files[0]!.hunks.map((hunk, hunkIndex) => ({
        ...hunk,
        id: `large:f${index}:h${hunkIndex}`,
        lines: hunk.lines.map((line, lineIndex) => ({ ...line, id: `large:f${index}:h${hunkIndex}:l${lineIndex}` })),
      })),
    }));
    render(
      <DiffView
        viewKey="large"
        files={manyFiles}
        activeFileId={manyFiles[0]!.id}
        showSourceCommits={false}
        collapsedFiles={new Set()}
        openLineId={null}
        drafts={{}}
        searchMatches={[]}
        activeSearchMatchIndex={-1}
        {...callbacks}
      />,
    );

    expect(document.querySelectorAll("article[data-file-id]")).toHaveLength(20);
    expect(document.querySelectorAll("article[data-diff-rendered='true']")).toHaveLength(2);
    expect(screen.getAllByLabelText(/^Scrollable diff for/)).toHaveLength(2);

    const distant = document.querySelector<HTMLElement>("article[data-file-id='large:f12']")!;
    const estimatedHeight = manyFiles[12]!.hunks.reduce((height, hunk) => height + 32 + hunk.lines.length * 26, 0);
    expect(distant.querySelector(":scope > [aria-hidden='true']")).toHaveStyle({ height: `${estimatedHeight}px` });
    act(() => notify([{ target: distant, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(distant).toHaveAttribute("data-diff-rendered", "true");
    expect(screen.getAllByLabelText(/^Scrollable diff for/)).toHaveLength(3);
    vi.unstubAllGlobals();
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
      activeFileId={files[0]?.id ?? null}
      showSourceCommits={false}
      collapsedFiles={new Set()}
      openLineId={null}
      drafts={{}}
      searchMatches={[]}
      activeSearchMatchIndex={-1}
      {...callbacks}
    />
  );
}
