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
  it("does not interrupt scrolling when an observer update leaves layout unchanged", async () => {
    let notify: IntersectionObserverCallback = () => undefined;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe() {}
      disconnect() {}
    });
    try {
      renderDiff("paging");
      const pane = screen.getByRole("main", { name: "Commit diff" });
      let top = 100;
      const setScrollTop = vi.fn((value: number) => { top = value; });
      Object.defineProperty(pane, "scrollTop", { configurable: true, get: () => top, set: setScrollTop });
      pane.getBoundingClientRect = vi.fn(() => ({ top: 0 }) as DOMRect);
      const cards = pane.querySelectorAll<HTMLElement>("article");
      cards.forEach((card, index) => {
        card.getBoundingClientRect = vi.fn(() => ({ top: index * 500 - top }) as DOMRect);
      });
      notify([{ target: cards[0]!, isIntersecting: false } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
      top = 150;
      await act(async () => { await Promise.resolve(); });
      expect(pane.scrollTop).toBe(150);
      expect(setScrollTop).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("bounds large hunks and keeps comment and search chunks mounted", () => {
    const observers = new Map<Element, IntersectionObserverCallback>();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) { observers.set(target, this.callback); }
      disconnect() {}
    });
    try {
      const largeFile: FileDiff = {
        ...files[0]!, id: "large-tsv", displayPath: "sources.tsv",
        hunks: [{ ...files[0]!.hunks[0]!, lines: Array.from({ length: 320 }, (_, index) => ({
          ...files[0]!.hunks[0]!.lines[0]!, id: `tsv-${index}`, text: index === 319 ? "\t" + "x".repeat(200) : "entry",
        })) }],
      };
      const props = {
        viewKey: "chunks", files: [largeFile], activeFileId: largeFile.id,
        showSourceCommits: false, collapsedFiles: new Set<string>(), openLineId: null,
        drafts: {}, searchMatches: [], activeSearchMatchIndex: -1,
      };
      const view = render(<DiffView {...props} {...callbacks} />);
      expect(document.querySelectorAll("[data-line-id]")).toHaveLength(64);
      const chunk = document.querySelector("[data-line-chunk='4']")!;
      expect(chunk.firstElementChild).toHaveStyle({ height: "1664px" });
      expect(document.querySelector("[style*='--diff-columns']")).toHaveStyle({ "--diff-columns": "208" });
      const notify = (visible: boolean) => act(() => observers.get(chunk)!([
        { target: chunk, isIntersecting: visible } as IntersectionObserverEntry,
      ], {} as IntersectionObserver));
      notify(true);
      expect(document.querySelectorAll("[data-line-id]")).toHaveLength(128);
      notify(false);
      expect(document.querySelectorAll("[data-line-id]")).toHaveLength(64);
      view.rerender(<DiffView {...props} openLineId="tsv-319" {...callbacks} />);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      notify(false);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      view.rerender(<DiffView {...props} searchMatches={[{ fileId: largeFile.id, lineId: "tsv-319", start: 1, end: 2 }]} activeSearchMatchIndex={0} {...callbacks} />);
      expect(document.querySelector("[data-line-id='tsv-319'] mark")).toBeInTheDocument();
      const smallHunks = Array.from({ length: 10 }, (_, index) => ({
        ...largeFile.hunks[0]!, id: `small-hunk-${index}`,
        lines: largeFile.hunks[0]!.lines.slice(index * 32, (index + 1) * 32),
      }));
      view.rerender(<DiffView {...props} files={[{ ...largeFile, hunks: smallHunks }]} {...callbacks} />);
      expect(document.querySelectorAll("[data-line-id]")).toHaveLength(32);
      view.rerender(<DiffView {...props} files={[{ ...largeFile, hunks: smallHunks }]} drafts={{ "tsv-319": { fileId: largeFile.id, lineId: "tsv-319", body: "Check this entry" } }} {...callbacks} />);
      expect(screen.getByText("Check this entry")).toBeInTheDocument();
      expect(document.querySelectorAll("[data-line-id]")).toHaveLength(64);
    } finally {
      vi.unstubAllGlobals();
    }
  });

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

  it("bounds estimated and measured placeholders while mounting every line", () => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    const largeFile: FileDiff = {
      ...files[0]!, id: "large-lockfile", displayPath: "large.lock",
      hunks: [{ ...files[0]!.hunks[0]!, lines: Array.from({ length: 100 }, (_, index) => ({
        ...files[0]!.hunks[0]!.lines[0]!, id: `large-line-${index}`,
      })) }],
    };
    const original = HTMLElement.prototype.getBoundingClientRect;
    const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("aria-label") === "Scrollable diff for large.lock"
        ? { height: 1_000_000 } as DOMRect : original.call(this);
    });
    try {
      const props = {
        viewKey: "bounded", files: [...files, largeFile], activeFileId: files[0]!.id,
        showSourceCommits: false, collapsedFiles: new Set<string>(), openLineId: null,
        drafts: {}, searchMatches: [], activeSearchMatchIndex: -1,
      };
      const view = render(<DiffView {...props} {...callbacks} />);
      const card = document.getElementById("file-large-lockfile")!;
      expect(card.querySelector(":scope > [aria-hidden='true']")).toHaveStyle({ height: "2048px" });
      view.rerender(<DiffView {...props} activeFileId={largeFile.id} {...callbacks} />);
      expect(card.querySelectorAll("[data-line-id]")).toHaveLength(100);
      view.rerender(<DiffView {...props} {...callbacks} />);
      expect(card.querySelector(":scope > [aria-hidden='true']")).toHaveStyle({ height: "2048px" });
    } finally {
      measure.mockRestore();
      vi.unstubAllGlobals();
    }
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
    const view = render(
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

    const pane = screen.getByRole("main", { name: "Commit diff" });
    const target = manyFiles[18]!;
    const card = document.getElementById(`file-${target.id}`)!;
    pane.getBoundingClientRect = vi.fn(() => ({ top: 80 }) as DOMRect);
    card.getBoundingClientRect = vi.fn(() => ({ top: 460 }) as DOMRect);
    pane.scrollTop = 120;
    const scrollTo = vi.fn(() => {
      expect(card).toHaveAttribute("data-diff-rendered", "true");
      expect(screen.getByLabelText(`Scrollable diff for ${target.displayPath}`)).toBeInTheDocument();
    });
    pane.scrollTo = scrollTo;
    const navigationProps = {
      viewKey: "large", files: manyFiles, activeFileId: manyFiles[0]!.id,
      showSourceCommits: false, collapsedFiles: new Set<string>(), openLineId: null,
      drafts: {}, searchMatches: [], activeSearchMatchIndex: -1,
    };
    view.rerender(<DiffView {...navigationProps} fileNavigation={{ fileId: target.id, requestId: 1 }} {...callbacks} />);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 488, behavior: "instant" });
    act(() => notify([{ target: card, isIntersecting: false } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(card).toHaveAttribute("data-diff-rendered", "true");
    view.rerender(<DiffView {...navigationProps} fileNavigation={{ fileId: target.id, requestId: 2 }} {...callbacks} />);
    expect(scrollTo).toHaveBeenCalledTimes(2);

    pane.querySelectorAll<HTMLElement>("article").forEach((item, index) => {
      item.getBoundingClientRect = vi.fn(() => ({ top: (index - 18) * 100 + 90 }) as DOMRect);
    });
    card.getBoundingClientRect = vi.fn(() => ({
      top: 90 + (distant.dataset.diffRendered === "false" ? -500 : 0),
    }) as DOMRect);
    pane.scrollTop = 5000;
    act(() => notify([{ target: distant, isIntersecting: false } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(pane.scrollTop).toBe(4500);

    Object.defineProperty(pane, "clientHeight", { configurable: true, value: 400 });
    pane.querySelectorAll<HTMLElement>("article").forEach((item, index) => {
      item.getBoundingClientRect = vi.fn(() => ({ top: index < 18 ? -5000 + index * 10 : index === 18 ? -200 : 2000 }) as DOMRect);
    });
    pane.scrollTop = 5000;
    fireEvent.scroll(pane);
    view.rerender(<DiffView {...navigationProps} viewKey="another-view" {...callbacks} />);
    expect(pane.scrollTop).toBe(0);
    card.getBoundingClientRect = vi.fn(() => ({ top: 700 }) as DOMRect);
    view.rerender(<DiffView {...navigationProps} {...callbacks} />);
    expect(card).toHaveAttribute("data-diff-rendered", "true");
    expect(pane.scrollTop).toBe(900);
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
