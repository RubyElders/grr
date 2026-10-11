import { useLayoutEffect, type Dispatch, type StateUpdater } from "preact/hooks";
import type { ReviewState } from "./state";
import type { ReviewView } from "./windowChrome/model";
import { matchesShortcut } from "./shortcuts";
import { cyclePane, focusPaneFilter, paneOf } from "./panes";

interface ReviewShortcutContext {
  state: Pick<ReviewState, "openLineId" | "phase">;
  view: ReviewView;
  commentCount: number;
  commitSelectorOpen: boolean;
  findOpen: boolean;
  shortcutHelpOpen: boolean;
  showView(view: ReviewView): void;
  setCommitSelectorOpen: Dispatch<StateUpdater<boolean>>;
  setFindOpen: Dispatch<StateUpdater<boolean>>;
  setShortcutHelpOpen: Dispatch<StateUpdater<boolean>>;
  setSidebarOpen: Dispatch<StateUpdater<boolean>>;
  cancelReview(): void;
  moveFind(direction: 1 | -1): void;
  navigateCommits(direction: "newer" | "older"): void;
  navigateFiles(direction: "previous" | "next"): void;
  submit(outcome: "approve" | "share", copyToClipboard?: boolean): Promise<void>;
}

export function useReviewShortcuts({
  state, view, commentCount, commitSelectorOpen, findOpen, shortcutHelpOpen,
  showView, setCommitSelectorOpen, setFindOpen, setShortcutHelpOpen, setSidebarOpen,
  cancelReview, moveFind, navigateCommits, navigateFiles, submit,
}: ReviewShortcutContext): void {
  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const dismiss = matchesShortcut(event, "dismiss");
      const closeWindow = matchesShortcut(event, "closeWindow");
      if (shortcutHelpOpen) {
        if (!dismiss && !closeWindow) return;
        event.preventDefault();
        if (dismiss) {
          setShortcutHelpOpen(false);
          return;
        }
        cancelReview();
        return;
      }

      if (matchesShortcut(event, "toggleView") && state.phase !== "loading" && state.openLineId === null && !isTextEntryTarget(event.target)) {
        event.preventDefault();
        showView(view === "changes" ? "history" : "changes");
        return;
      }
      const changes = view === "changes";
      if (!changes && matchesShortcut(event, "historyBack") && state.openLineId === null && !event.defaultPrevented && !isTextEntryTarget(event.target)) {
        event.preventDefault();
        showView("changes");
        return;
      }

      const pane = paneOf(event.target);
      const changesScope = document.querySelector("[data-view='changes']");
      const nextPane = matchesShortcut(event, "nextPane");
      if (changes && (nextPane || matchesShortcut(event, "previousPane"))
        && state.openLineId === null
        && !commitSelectorOpen
        && !(event.target instanceof Element && event.target.closest("[role='search']"))) {
        event.preventDefault();
        cyclePane(changesScope, pane, nextPane ? 1 : -1);
        return;
      }
      if (changes && findNative(event) && pane === "files" && state.phase === "ready") {
        event.preventDefault();
        focusPaneFilter(changesScope, "files");
        return;
      }

      const openHelp = matchesShortcut(event, "help")
        && state.openLineId === null
        && state.phase === "ready"
        && !isTextEntryTarget(event.target);
      const toggleSidebar = matchesShortcut(event, "toggleSidebar")
        && state.phase === "ready";
      const browseCommits = changes
        && matchesShortcut(event, "browseCommits")
        && state.openLineId === null
        && state.phase === "ready"
        && commentCount === 0
        && !findOpen
        && !isTextEntryTarget(event.target);
      const findFunction = matchesShortcut(event, "find", "function");
      const openFind = changes && (findNative(event) || (!findOpen && findFunction));
      const findInput = event.target instanceof HTMLElement && event.target.matches("[data-find-input]");
      const nextMatch = findOpen
        && matchesShortcut(event, "nextMatch")
        && (!matchesShortcut(event, "nextMatch", "enter") || findInput);
      const previousMatch = findOpen
        && matchesShortcut(event, "previousMatch")
        && (!matchesShortcut(event, "previousMatch", "enter") || findInput);
      const dismissFind = dismiss && findOpen;
      const dismissSelector = dismiss && commitSelectorOpen;
      const closeWithEscape = dismiss && state.openLineId === null && !commitSelectorOpen && !findOpen && !isTextEntryTarget(event.target);
      const runPrimaryAction = matchesShortcut(event, "primaryAction")
        && state.openLineId === null
        && !findOpen
        && state.phase === "ready";
      const runCopyPrimaryAction = matchesShortcut(event, "copyPrimaryAction")
        && state.openLineId === null
        && !findOpen
        && state.phase === "ready";
      const pageDown = matchesShortcut(event, "pageDown");
      const pageUp = matchesShortcut(event, "pageUp");
      const pageDiff = (pageDown || pageUp)
        && !commitSelectorOpen
        && !findOpen
        && state.openLineId === null
        && state.phase === "ready"
        && !isTextEntryTarget(event.target);
      const newerCommit = matchesShortcut(event, "newerCommit");
      const olderCommit = matchesShortcut(event, "olderCommit");
      const stepCommit = changes
        && (newerCommit || olderCommit)
        && !commitSelectorOpen
        && !findOpen
        && state.openLineId === null
        && state.phase === "ready"
        && commentCount === 0
        && !isTextEntryTarget(event.target);
      const previousFile = matchesShortcut(event, "previousFile") || matchesShortcut(event, "previousDiffFile");
      const nextFile = matchesShortcut(event, "nextFile") || matchesShortcut(event, "nextDiffFile");
      const arrowStep = matchesShortcut(event, "previousFile", "arrow") || matchesShortcut(event, "nextFile", "arrow");
      const stepFile = changes
        && (previousFile || nextFile)
        && !(arrowStep && pane === "diff")
        && !commitSelectorOpen
        && !findOpen
        && state.openLineId === null
        && state.phase === "ready"
        && !isTextEntryTarget(event.target);
      if (!openHelp && !toggleSidebar && !browseCommits && !openFind && !nextMatch && !previousMatch && !dismissFind && !dismissSelector && !closeWithEscape && !closeWindow && !runPrimaryAction && !runCopyPrimaryAction && !pageDiff && !stepCommit && !stepFile) return;

      event.preventDefault();
      if (toggleSidebar) {
        setSidebarOpen((open) => !open);
        return;
      }
      if (openHelp) {
        setCommitSelectorOpen(false);
        setFindOpen(false);
        setShortcutHelpOpen(true);
        return;
      }
      if (browseCommits) {
        setCommitSelectorOpen(!commitSelectorOpen);
        return;
      }
      if (openFind) {
        setCommitSelectorOpen(false);
        if (findOpen) {
          const input = document.querySelector<HTMLInputElement>("[data-find-input]");
          input?.focus();
          input?.select();
        } else {
          setFindOpen(true);
        }
        return;
      }
      if (nextMatch || previousMatch) {
        moveFind(previousMatch ? -1 : 1);
        return;
      }
      if (dismissFind) {
        setFindOpen(false);
        return;
      }
      if (pageDiff) {
        const pane = [...document.querySelectorAll<HTMLElement>("main[aria-label='Commit diff']")]
          .find((element) => (element.closest("section[aria-label='History']") !== null) === !changes);
        pane?.scrollBy({
          top: (pageUp ? -1 : 1) * Math.max(1, pane.clientHeight - 48),
          behavior: "smooth",
        });
        return;
      }
      if (stepCommit) {
        navigateCommits(newerCommit ? "newer" : "older");
        return;
      }
      if (stepFile) {
        navigateFiles(previousFile ? "previous" : "next");
        return;
      }
      if (dismissSelector) {
        setCommitSelectorOpen(false);
        return;
      }
      if (runPrimaryAction || runCopyPrimaryAction) {
        void submit(commentCount === 0 ? "approve" : "share", runCopyPrimaryAction);
        return;
      }
      cancelReview();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cancelReview, commentCount, commitSelectorOpen, findOpen, moveFind, navigateCommits, navigateFiles, shortcutHelpOpen, showView, state.openLineId, state.phase, submit, view]);
}

function findNative(event: KeyboardEvent): boolean {
  return matchesShortcut(event, "find", "native");
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}
