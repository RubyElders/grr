import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useState } from "preact/hooks";
import type { ReviewBackend } from "./backend";
import { tauriBackend } from "./backend";
import { reviewReducer, initialState, orderedComments, submissionFor } from "./state";
import { FileTree } from "./components/FileTree";
import { DiffView } from "./components/DiffView";
import { ReviewActions } from "./components/ReviewActions";
import { CommitSelector } from "./components/CommitSelector";
import { CommitMessagePanel } from "./components/CommitMessagePanel";
import { FindPopover } from "./components/FindPopover";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { WindowTitlebar } from "./components/WindowTitlebar";
import { adjacentMatch, findCodeMatches } from "./codeSearch";
import { commitNavigationTarget } from "./commitPresentation";
import { reviewViewKey } from "./scrollPosition";
import { matchesShortcut } from "./shortcuts";
import { filesInTreeOrder } from "./tree";
import { listenNativeHeaderActions, nativeHeaderUpdate, updateNativeHeader, usesNativeHeader } from "./nativeHeader";
import type { ReviewData } from "./types";
import styles from "./App.module.css";

export function ReviewApp({ backend = tauriBackend }: { backend?: ReviewBackend }) {
  const nativeHeader = usesNativeHeader();
  const [state, dispatch] = useReducer(reviewReducer, initialState);
  const [commitSelectorOpen, setCommitSelectorOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [findQuery, setFindQuery] = useState("");
  const [activeFindIndex, setActiveFindIndex] = useState(-1);
  useEffect(() => {
    let mounted = true;
    backend.getReview().then(
      (data) => mounted && dispatch({ type: "loaded", data: orderReviewFiles(data) }),
      (error: unknown) => mounted && dispatch({ type: "failed", error: errorMessage(error) }),
    );
    return () => { mounted = false; };
  }, [backend]);

  const comments = useMemo(() => orderedComments(state), [state.data, state.drafts]);
  const findMatches = useMemo(
    () => findCodeMatches(state.data?.files ?? [], findQuery),
    [findQuery, state.data?.files],
  );
  const updateFindQuery = useCallback((query: string) => {
    setFindQuery(query);
    setActiveFindIndex(findCodeMatches(state.data?.files ?? [], query).length > 0 ? 0 : -1);
  }, [state.data?.files]);
  useEffect(() => {
    setActiveFindIndex(findCodeMatches(state.data?.files ?? [], findQuery).length > 0 ? 0 : -1);
  }, [state.data?.files]);
  useEffect(() => {
    if (!findOpen) return;
    const match = findMatches[activeFindIndex];
    if (!match) return;
    if (state.collapsedFiles.has(match.fileId)) dispatch({ type: "toggle-file", fileId: match.fileId });
    dispatch({ type: "activate-file", fileId: match.fileId });
  }, [activeFindIndex, findMatches, findOpen, state.collapsedFiles]);

  const moveFind = useCallback((direction: 1 | -1) => {
    setActiveFindIndex((current) => adjacentMatch(current, findMatches.length, direction));
  }, [findMatches.length]);
  const submit = useCallback(async (outcome: "approve" | "share", copyToClipboard = false) => {
    dispatch({ type: "submitting" });
    try {
      await backend.finishReview(submissionFor(state, outcome), copyToClipboard);
    } catch (error) {
      dispatch({ type: "submit-failed", error: errorMessage(error) });
    }
  }, [backend, state]);
  const cancelReview = useCallback(() => {
    void backend.cancelReview().catch((error: unknown) => {
      dispatch({ type: "submit-failed", error: errorMessage(error) });
    });
  }, [backend]);

  const selectCommits = useCallback(async (commitIds: string[]) => {
    dispatch({ type: "selection-started" });
    try {
      const data = await backend.selectCommits(commitIds);
      dispatch({ type: "selection-loaded", data: orderReviewFiles(data) });
    } catch (error) {
      dispatch({ type: "submit-failed", error: errorMessage(error) });
    }
  }, [backend]);

  const navigateCommits = useCallback((direction: "newer" | "older") => {
    if (!state.data) return;
    const target = commitNavigationTarget(state.data, direction);
    if (target) void selectCommits(target.selectedCommitIds);
  }, [selectCommits, state.data]);

  const selectFile = useCallback((fileId: string) => {
    dispatch({ type: "activate-file", fileId });
    const pane = document.querySelector<HTMLElement>("main[aria-label='Commit diff']");
    const file = document.getElementById(`file-${fileId}`);
    if (!pane || !file) return;
    const top = pane.scrollTop + file.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12;
    pane.scrollTo({ top, behavior: "smooth" });
  }, []);

  const navigateFiles = useCallback((direction: "previous" | "next") => {
    if (!state.data || state.data.files.length === 0) return;
    const current = state.data.files.findIndex((file) => file.id === state.activeFileId);
    const targetIndex = current < 0
      ? direction === "next" ? 0 : state.data.files.length - 1
      : current + (direction === "next" ? 1 : -1);
    const target = state.data.files[targetIndex];
    if (target) selectFile(target.id);
  }, [selectFile, state.activeFileId, state.data]);

  useEffect(() => {
    if (!nativeHeader || !state.data) return;
    const disabled = comments.length > 0 || state.phase === "selecting" || state.phase === "submitting";
    void updateNativeHeader(nativeHeaderUpdate(state.data, disabled)).catch((error: unknown) => {
      dispatch({ type: "submit-failed", error: errorMessage(error) });
    });
  }, [comments.length, nativeHeader, state.data, state.phase]);

  useEffect(() => {
    if (!nativeHeader) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listenNativeHeaderActions((action) => {
      if (action === "sidebar" && state.phase === "ready") setSidebarOpen((open) => !open);
      if (action === "help" && state.phase === "ready") {
        setCommitSelectorOpen(false);
        setFindOpen(false);
        setShortcutHelpOpen(true);
      }
      if (action === "picker" && state.phase === "ready" && comments.length === 0) {
        setCommitSelectorOpen((open) => !open);
      }
      if ((action === "newer" || action === "older") && state.phase === "ready" && comments.length === 0) {
        navigateCommits(action);
      }
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch((error: unknown) => {
      dispatch({ type: "submit-failed", error: errorMessage(error) });
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [comments.length, nativeHeader, navigateCommits, state.phase]);

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

      const openHelp = matchesShortcut(event, "help")
        && state.openLineId === null
        && state.phase === "ready"
        && !isTextEntryTarget(event.target);
      const toggleSidebar = matchesShortcut(event, "toggleSidebar")
        && state.phase === "ready";
      const browseCommits = matchesShortcut(event, "browseCommits")
        && state.openLineId === null
        && state.phase === "ready"
        && comments.length === 0
        && !findOpen
        && !isTextEntryTarget(event.target);
      const findNative = matchesShortcut(event, "find", "native");
      const findFunction = matchesShortcut(event, "find", "function");
      const openFind = findNative || (!findOpen && findFunction);
      const findInput = event.target instanceof HTMLElement && event.target.matches("[data-find-input]");
      const nextMatch = findOpen
        && matchesShortcut(event, "nextMatch")
        && (!matchesShortcut(event, "nextMatch", "enter") || findInput);
      const previousMatch = findOpen
        && matchesShortcut(event, "previousMatch")
        && (!matchesShortcut(event, "previousMatch", "enter") || findInput);
      const dismissFind = dismiss && findOpen;
      const dismissSelector = dismiss && commitSelectorOpen;
      const closeWithEscape = dismiss && state.openLineId === null && !commitSelectorOpen && !findOpen;
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
      const stepCommit = (newerCommit || olderCommit)
        && !commitSelectorOpen
        && !findOpen
        && state.openLineId === null
        && state.phase === "ready"
        && comments.length === 0
        && !isTextEntryTarget(event.target);
      const previousFile = matchesShortcut(event, "previousFile");
      const nextFile = matchesShortcut(event, "nextFile");
      const stepFile = (previousFile || nextFile)
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
        const pane = document.querySelector<HTMLElement>("main[aria-label='Commit diff']");
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
        void submit(comments.length === 0 ? "approve" : "share", runCopyPrimaryAction);
        return;
      }
      cancelReview();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cancelReview, comments.length, commitSelectorOpen, findOpen, moveFind, navigateCommits, navigateFiles, shortcutHelpOpen, state.openLineId, state.phase, submit]);

  if (state.phase === "loading") return (
    <div class={styles.app}>
      <div class={styles.headerArea}>{nativeHeader ? null : <WindowTitlebar onClose={cancelReview}><strong class={styles.windowTitle}>grr</strong></WindowTitlebar>}</div>
      <div class={styles.center} role="status">Loading commit diff…</div>
    </div>
  );
  if (state.phase === "error" || !state.data) return (
    <div class={styles.app}>
      <div class={styles.headerArea}>{nativeHeader ? null : <WindowTitlebar onClose={cancelReview}><strong class={styles.windowTitle}>grr</strong></WindowTitlebar>}</div>
      <div class={styles.center}><div class={styles.fatal} role="alert"><h1>Could not load review</h1><p>{state.error}</p></div></div>
    </div>
  );

  return (
    <div class={styles.app}>
      <div class={styles.headerArea}>
        {nativeHeader ? null : <WindowTitlebar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onHelp={() => setShortcutHelpOpen(true)}
          onClose={cancelReview}
        >
          <CommitSelector
            data={state.data}
            open={commitSelectorOpen}
            loading={state.phase === "selecting"}
            disabled={comments.length > 0 || state.phase === "submitting"}
            onOpenChange={setCommitSelectorOpen}
            onSelect={(commitIds) => void selectCommits(commitIds)}
          />
        </WindowTitlebar>}
        {nativeHeader ? <CommitSelector
          data={state.data}
          open={commitSelectorOpen}
          loading={state.phase === "selecting"}
          disabled={comments.length > 0 || state.phase === "submitting"}
          nativeHeader
          onOpenChange={setCommitSelectorOpen}
          onSelect={(commitIds) => void selectCommits(commitIds)}
        /> : null}
        <CommitMessagePanel data={state.data} />
      </div>
      <div class={`${styles.content} ${sidebarOpen ? "" : styles.sidebarHidden}`}>
        {sidebarOpen ? (
          <FileTree
            files={state.data.files}
            showSourceCommits={state.data.selectedCommitIds.length > 1}
            filter={state.filter}
            activeFileId={state.activeFileId}
            collapsedDirectories={state.collapsedDirectories}
            onFilter={(value) => dispatch({ type: "filter", value })}
            onToggleDirectory={(path) => dispatch({ type: "toggle-directory", path })}
            onSelectFile={selectFile}
          />
        ) : null}
        <DiffView
          viewKey={reviewViewKey(state.data)}
          files={state.data.files}
          activeFileId={state.activeFileId}
          showSourceCommits={state.data.selectedCommitIds.length > 1}
          collapsedFiles={state.collapsedFiles}
          openLineId={state.openLineId}
          drafts={state.drafts}
          searchMatches={findOpen ? findMatches : []}
          activeSearchMatchIndex={findOpen ? activeFindIndex : -1}
          onToggleFile={(fileId) => dispatch({ type: "toggle-file", fileId })}
          onOpenComment={(lineId) => dispatch({ type: "open-comment", lineId })}
          onCloseComment={() => dispatch({ type: "close-comment" })}
          onSaveComment={(comment) => dispatch({ type: "save-comment", comment })}
          onDeleteComment={(lineId) => dispatch({ type: "delete-comment", lineId })}
          onVisibleFile={(fileId) => dispatch({ type: "activate-file", fileId })}
        />
        {findOpen ? (
          <FindPopover
            query={findQuery}
            activeIndex={activeFindIndex}
            matchCount={findMatches.length}
            onQuery={updateFindQuery}
            onPrevious={() => moveFind(-1)}
            onNext={() => moveFind(1)}
            onClose={() => setFindOpen(false)}
          />
        ) : null}
      </div>
      <ReviewActions
        repositoryRoot={state.data.repositoryRoot}
        draftCount={comments.length}
        submitting={state.phase === "submitting" || state.phase === "selecting"}
        error={state.error}
        onApprove={(copyToClipboard) => void submit("approve", copyToClipboard)}
        onShare={(copyToClipboard) => void submit("share", copyToClipboard)}
      />
      {shortcutHelpOpen ? <ShortcutHelp onClose={() => setShortcutHelpOpen(false)} /> : null}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function orderReviewFiles(data: ReviewData): ReviewData {
  return { ...data, files: filesInTreeOrder(data.files) };
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}
