import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useState } from "preact/hooks";
import type { ReviewBackend } from "./backend";
import { tauriBackend } from "./backend";
import { reviewReducer, initialState, orderedComments, submissionFor } from "./state";
import { FileTree } from "./components/FileTree";
import { DiffView } from "./components/DiffView";
import { ReviewActions } from "./components/ReviewActions";
import { CommitSelector } from "./components/CommitSelector";
import { reviewViewKey } from "./scrollPosition";
import styles from "./App.module.css";

export function ReviewApp({ backend = tauriBackend }: { backend?: ReviewBackend }) {
  const [state, dispatch] = useReducer(reviewReducer, initialState);
  const [commitSelectorOpen, setCommitSelectorOpen] = useState(false);
  useEffect(() => {
    let mounted = true;
    backend.getReview().then(
      (data) => mounted && dispatch({ type: "loaded", data }),
      (error: unknown) => mounted && dispatch({ type: "failed", error: errorMessage(error) }),
    );
    return () => { mounted = false; };
  }, [backend]);

  const comments = useMemo(() => orderedComments(state), [state]);
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
      dispatch({ type: "selection-loaded", data });
    } catch (error) {
      dispatch({ type: "submit-failed", error: errorMessage(error) });
    }
  }, [backend]);

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const dismissSelector = event.key === "Escape" && commitSelectorOpen;
      const closeWithEscape = event.key === "Escape" && state.openLineId === null && !commitSelectorOpen;
      const closeWithW = event.key.toLowerCase() === "w" && (event.ctrlKey || event.metaKey);
      const closeWithF4 = event.key === "F4" && event.altKey;
      const runPrimaryAction = event.key === "Enter"
        && (event.ctrlKey || event.metaKey)
        && state.openLineId === null
        && state.phase === "ready";
      if (!dismissSelector && !closeWithEscape && !closeWithW && !closeWithF4 && !runPrimaryAction) return;

      event.preventDefault();
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
  }, [backend, comments.length, commitSelectorOpen, state.openLineId, state.phase, submit]);

  if (state.phase === "loading") return <div class={styles.center} role="status">Loading commit diff…</div>;
  if (state.phase === "error" || !state.data) return <div class={styles.center}><div class={styles.fatal} role="alert"><h1>Could not load review</h1><p>{state.error}</p></div></div>;

  const selectFile = (fileId: string) => {
    dispatch({ type: "activate-file", fileId });
    document.getElementById(`file-${fileId}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <div class={styles.app}>
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
          onToggleFile={(fileId) => dispatch({ type: "toggle-file", fileId })}
          onOpenComment={(lineId) => dispatch({ type: "open-comment", lineId })}
          onCloseComment={() => dispatch({ type: "close-comment" })}
          onSaveComment={(comment) => dispatch({ type: "save-comment", comment })}
          onDeleteComment={(lineId) => dispatch({ type: "delete-comment", lineId })}
          onVisibleFile={(fileId) => dispatch({ type: "activate-file", fileId })}
        />
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
