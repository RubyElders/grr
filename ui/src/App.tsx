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
import { adjacentMatch, findCodeMatches } from "./codeSearch";
import { commitNavigationTarget } from "./commitPresentation";
import { reviewViewKey } from "./scrollPosition";
import { filesInTreeOrder } from "./tree";
import type { ReviewData } from "./types";
import styles from "./App.module.css";

export function ReviewApp({ backend = tauriBackend }: { backend?: ReviewBackend }) {
  const [state, dispatch] = useReducer(reviewReducer, initialState);
  const [commitSelectorOpen, setCommitSelectorOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
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

  const comments = useMemo(() => orderedComments(state), [state]);
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
  const submit = useCallback(async (outcome: "approve" | "share") => {
    dispatch({ type: "submitting" });
    try {
      await backend.finishReview(submissionFor(state, outcome));
    } catch (error) {
      dispatch({ type: "submit-failed", error: errorMessage(error) });
    }
  }, [backend, state]);

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

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const nativeModifier = event.ctrlKey || event.metaKey;
      const findShortcut = event.key.toLowerCase() === "f" && nativeModifier && !event.altKey;
      const openFind = findShortcut || (!findOpen && event.key === "F3" && !nativeModifier && !event.altKey);
      const repeatFind = findOpen && (
        (event.key === "F3" && !nativeModifier && !event.altKey)
        || (event.key.toLowerCase() === "g" && nativeModifier && !event.altKey)
      );
      const findInputEnter = findOpen
        && event.key === "Enter"
        && event.target instanceof HTMLElement
        && event.target.matches("[data-find-input]");
      const dismissFind = event.key === "Escape" && findOpen;
      const dismissSelector = event.key === "Escape" && commitSelectorOpen;
      const closeWithEscape = event.key === "Escape" && state.openLineId === null && !commitSelectorOpen && !findOpen;
      const closeWithW = event.key.toLowerCase() === "w" && (event.ctrlKey || event.metaKey);
      const closeWithF4 = event.key === "F4" && event.altKey;
      const runPrimaryAction = event.key === "Enter"
        && (event.ctrlKey || event.metaKey)
        && state.openLineId === null
        && !findOpen
        && state.phase === "ready";
      const pageDiff = (event.key === " " || event.code === "Space")
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && !commitSelectorOpen
        && !findOpen
        && state.openLineId === null
        && state.phase === "ready"
        && !isInteractiveTarget(event.target);
      const stepCommit = (event.key === "ArrowLeft" || event.key === "ArrowRight")
        && !nativeModifier
        && !event.altKey
        && !event.shiftKey
        && !commitSelectorOpen
        && !findOpen
        && state.openLineId === null
        && state.phase === "ready"
        && comments.length === 0
        && !isInteractiveTarget(event.target);
      const stepFile = (event.key === "ArrowUp" || event.key === "ArrowDown")
        && !nativeModifier
        && !event.altKey
        && !event.shiftKey
        && !commitSelectorOpen
        && !findOpen
        && state.openLineId === null
        && state.phase === "ready"
        && !isInteractiveTarget(event.target);
      if (!openFind && !repeatFind && !findInputEnter && !dismissFind && !dismissSelector && !closeWithEscape && !closeWithW && !closeWithF4 && !runPrimaryAction && !pageDiff && !stepCommit && !stepFile) return;

      event.preventDefault();
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
      if (repeatFind || findInputEnter) {
        moveFind(event.shiftKey ? -1 : 1);
        return;
      }
      if (dismissFind) {
        setFindOpen(false);
        return;
      }
      if (pageDiff) {
        const pane = document.querySelector<HTMLElement>("main[aria-label='Commit diff']");
        pane?.scrollBy({
          top: (event.shiftKey ? -1 : 1) * Math.max(1, pane.clientHeight - 48),
          behavior: "smooth",
        });
        return;
      }
      if (stepCommit) {
        navigateCommits(event.key === "ArrowLeft" ? "newer" : "older");
        return;
      }
      if (stepFile) {
        navigateFiles(event.key === "ArrowUp" ? "previous" : "next");
        return;
      }
      if (dismissSelector) {
        setCommitSelectorOpen(false);
        return;
      }
      if (runPrimaryAction) {
        void submit(comments.length === 0 ? "approve" : "share");
        return;
      }
      void backend.cancelReview().catch((error: unknown) => {
        dispatch({ type: "submit-failed", error: errorMessage(error) });
      });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [backend, comments.length, commitSelectorOpen, findOpen, moveFind, navigateCommits, navigateFiles, state.openLineId, state.phase, submit]);

  if (state.phase === "loading") return <div class={styles.center} role="status">Loading commit diff…</div>;
  if (state.phase === "error" || !state.data) return <div class={styles.center}><div class={styles.fatal} role="alert"><h1>Could not load review</h1><p>{state.error}</p></div></div>;

  return (
    <div class={styles.app}>
      <div class={styles.headerArea}>
        <header class={styles.topbar}>
          <div class={styles.brand}>grr</div>
          <CommitSelector
            data={state.data}
            open={commitSelectorOpen}
            loading={state.phase === "selecting"}
            disabled={comments.length > 0 || state.phase === "submitting"}
            onOpenChange={setCommitSelectorOpen}
            onSelect={(commitIds) => void selectCommits(commitIds)}
          />
          <div class={styles.repository} title={state.data.repositoryRoot}>{state.data.repositoryRoot}</div>
        </header>
        <CommitMessagePanel data={state.data} />
      </div>
      <div class={styles.content}>
        <FileTree
          files={state.data.files}
          filter={state.filter}
          activeFileId={state.activeFileId}
          collapsedDirectories={state.collapsedDirectories}
          onFilter={(value) => dispatch({ type: "filter", value })}
          onToggleDirectory={(path) => dispatch({ type: "toggle-directory", path })}
          onSelectFile={selectFile}
        />
        <DiffView
          viewKey={reviewViewKey(state.data)}
          files={state.data.files}
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
        draftCount={comments.length}
        submitting={state.phase === "submitting" || state.phase === "selecting"}
        error={state.error}
        onApprove={() => void submit("approve")}
        onShare={() => void submit("share")}
      />
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function orderReviewFiles(data: ReviewData): ReviewData {
  return { ...data, files: filesInTreeOrder(data.files) };
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest("button, input, textarea, select, a, [contenteditable='true']") !== null;
}
