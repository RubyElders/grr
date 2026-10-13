import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "preact/hooks";
import type { ReviewBackend } from "./backend";
import { tauriBackend } from "./backend";
import { orderedComments, submissionFor } from "./state";
import { FileTree } from "./components/FileTree";
import { DiffView } from "./components/DiffView";
import { ReviewActions } from "./components/ReviewActions";
import { CommitSelector } from "./components/CommitSelector";
import { CommitMessagePanel } from "./components/CommitMessagePanel";
import { ReviewWorkspace } from "./components/ReviewWorkspace";
import { FindPopover } from "./components/FindPopover";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { ReloadDialog } from "./components/ReloadDialog";
import { WindowTitlebar } from "./components/WindowTitlebar";
import { adjacentMatch, findCodeMatches } from "./codeSearch";
import { commitNavigationTarget } from "./commitPresentation";
import { reviewViewKey } from "./scrollPosition";
import { useReviewShortcuts } from "./useReviewShortcuts";
import { usePaneFocus } from "./usePaneFocus";
import { filteredFiles } from "./tree";
import { useReviewScope } from "./useReviewScope";
import { useWindowChrome } from "./windowChrome/useWindowChrome";
import { windowChromeCapabilities, type ReviewView, type WindowChromeKind } from "./windowChrome/model";
import styles from "./App.module.css";

export function ReviewApp({ backend = tauriBackend, chromeMode = "html" }: { backend?: ReviewBackend; chromeMode?: WindowChromeKind }) {
  const capabilities = windowChromeCapabilities(chromeMode);
  const nativeChrome = capabilities.nativeHeader;
  const [commitSelectorOpen, setCommitSelectorOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState<ReviewView>("changes");
  const [historyMounted, setHistoryMounted] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [activeFindIndex, setActiveFindIndex] = useState(-1);
  const [fileNavigation, setFileNavigation] = useState<{ fileId: string; requestId: number; viewKey: string } | null>(null);
  const scope = useReviewScope(backend, historyMounted);
  const { state, dispatch, data } = scope;
  useLayoutEffect(() => {
    if (scope.initialView === "history") {
      setHistoryMounted(true);
      setView("history");
    }
  }, [scope.initialView]);
  const files = useMemo(() => filteredFiles(data?.files ?? [], state.filter), [data?.files, state.filter]);
  const activeFileId = files.some((file) => file.id === state.activeFileId) ? state.activeFileId : files[0]?.id ?? null;
  const viewKey = state.data ? `${reviewViewKey(state.data)}:files:${state.filter.trim().toLocaleLowerCase()}` : "";

  const comments = useMemo(() => orderedComments(state), [state.data, state.drafts]);
  const reload = useCallback(async () => {
    if (await scope.reload()) {
      setReloadOpen(false);
      setCommitSelectorOpen(false);
      setFileNavigation(null);
    }
  }, [scope.reload]);
  const requestReload = useCallback(() => {
    if (comments.length > 0 || state.openLineId !== null) setReloadOpen(true);
    else void reload();
  }, [comments.length, state.openLineId, reload]);
  const findMatches = useMemo(
    () => findCodeMatches(files, findQuery),
    [findQuery, files],
  );
  const updateFindQuery = useCallback((query: string) => {
    setFindQuery(query);
    setActiveFindIndex(findCodeMatches(files, query).length > 0 ? 0 : -1);
  }, [files]);
  useEffect(() => {
    setActiveFindIndex(findCodeMatches(files, findQuery).length > 0 ? 0 : -1);
  }, [files]);
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
    if (scope.pending || scope.disabledReason !== null) return;
    dispatch({ type: "submitting" });
    try {
      await backend.finishReview(submissionFor(state, outcome), copyToClipboard);
    } catch (error) {
      dispatch({ type: "submit-failed", error: errorMessage(error) });
    }
  }, [backend, state, scope.pending, scope.disabledReason]);
  const cancelReview = useCallback(() => {
    void backend.cancelReview().catch((error: unknown) => {
      dispatch({ type: "submit-failed", error: errorMessage(error) });
    });
  }, [backend]);

  usePaneFocus(view, reloadOpen ? "reload" : shortcutHelpOpen ? "help" : commitSelectorOpen ? "picker"
    : state.openLineId !== null ? "comment" : findOpen ? "find" : "panes", data !== null);

  const showView = useCallback((next: ReviewView) => {
    if (next === "history") {
      setCommitSelectorOpen(false);
      setHistoryMounted(true);
    }
    setView(next);
  }, []);

  const selectCommits = useCallback((commitIds: string[]) => {
    setFileNavigation(null);
    scope.selectCommits(commitIds);
  }, [scope.selectCommits]);

  const navigateCommits = useCallback((direction: "newer" | "older") => {
    if (!data) return;
    const target = commitNavigationTarget(data, direction);
    if (target) void selectCommits(target.selectedCommitIds);
  }, [selectCommits, data]);

  const selectFile = useCallback((fileId: string) => {
    if (!files.some((file) => file.id === fileId)) return;
    dispatch({ type: "activate-file", fileId });
    setFileNavigation((previous) => ({ fileId, requestId: (previous?.requestId ?? 0) + 1, viewKey }));
  }, [files, viewKey]);

  const navigateFiles = useCallback((direction: "previous" | "next") => {
    const current = files.findIndex((file) => file.id === activeFileId);
    const targetIndex = current < 0 ? direction === "next" ? 0 : files.length - 1
      : current + (direction === "next" ? 1 : -1);
    const target = files[targetIndex];
    if (target) selectFile(target.id);
  }, [selectFile, activeFileId, files]);

  useWindowChrome(
    chromeMode,
    data,
    comments.length > 0 || scope.pending || state.phase !== "ready",
    view,
    scope.headRef,
    (action) => {
      if ((action === "changes" || action === "history") && state.phase !== "loading") showView(action);
      if (action === "sidebar" && state.phase === "ready") setSidebarOpen((open) => !open);
      if (action === "help" && state.phase === "ready") {
        setCommitSelectorOpen(false);
        setFindOpen(false);
        setShortcutHelpOpen(true);
      }
      if (view !== "changes") return;
      if (action === "picker" && state.phase === "ready" && comments.length === 0) {
        setCommitSelectorOpen((open) => !open);
      }
      if ((action === "newer" || action === "older") && state.phase === "ready" && comments.length === 0) {
        navigateCommits(action);
      }
    },
    (error) => {
      dispatch({ type: "submit-failed", error: errorMessage(error) });
    },
  );

  useReviewShortcuts({
    reloadOpen, requestReload, closeReload: () => { if (!scope.reloading) setReloadOpen(false); },
    state: scope.pending ? { ...state, phase: "selecting" } : state, view, commentCount: comments.length, commitSelectorOpen, findOpen, shortcutHelpOpen,
    showView, setCommitSelectorOpen, setFindOpen, setShortcutHelpOpen, setSidebarOpen,
    cancelReview, moveFind, navigateCommits, navigateFiles, submit,
  });

  if (state.phase === "loading") return (
    <div class={styles.app} data-window-chrome={chromeMode}>
      <div class={styles.headerArea}>{nativeChrome ? null : <WindowTitlebar capabilities={capabilities} onClose={cancelReview}><strong class={styles.windowTitle}>grr</strong></WindowTitlebar>}</div>
      <div class={styles.center} role="status">Loading commit diff…</div>
    </div>
  );
  if (state.phase === "error" || !data || !scope.baseReview) return (
    <div class={styles.app} data-window-chrome={chromeMode}>
      <div class={styles.headerArea}>{nativeChrome ? null : <WindowTitlebar capabilities={capabilities} onClose={cancelReview}><strong class={styles.windowTitle}>grr</strong></WindowTitlebar>}</div>
      <div class={styles.center}><div class={styles.fatal} role="alert"><h1>Could not load review</h1><p>{state.error}</p></div></div>
    </div>
  );

  const commitSelector = <CommitSelector
    data={data}
    open={commitSelectorOpen}
    loading={state.phase === "selecting"}
    disabled={comments.length > 0 || state.phase === "submitting"}
    placement={nativeChrome ? "native" : capabilities.customCaptionButtons ? "titlebar" : "inline"}
    onOpenChange={setCommitSelectorOpen}
    onSelect={(commitIds) => void selectCommits(commitIds)}
  />;

  const openDisabledReason = scope.disabledReason;
  const historyTitle = (
    <div class={styles.historyTitle}>
      <strong>{scope.headRef ?? "History"}</strong>
      <span>History</span>
    </div>
  );

  return (
    <div class={styles.app} data-window-chrome={chromeMode}>
      <div class={styles.headerArea}>
        {nativeChrome ? (view === "changes" ? commitSelector : null) : <WindowTitlebar
          capabilities={capabilities}
          sidebarOpen={sidebarOpen}
          view={view}
          onView={showView}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onHelp={() => setShortcutHelpOpen(true)}
          onClose={cancelReview}
        >
          {view === "changes" ? commitSelector : historyTitle}
        </WindowTitlebar>}
        {view === "changes" ? <CommitMessagePanel data={data} /> : null}
      </div>
      <ReviewWorkspace
        review={scope.baseReview}
        commits={scope.commits}
        visibleCommits={scope.visibleCommits}
        selectedIds={scope.selectedIds}
        filter={scope.commitFilter}
        loading={scope.historyLoading}
        hasMore={scope.hasMore}
        error={scope.historyError}
        view={view}
        keyboardEnabled={!reloadOpen && !scope.reloading && !shortcutHelpOpen && state.openLineId === null && !findOpen}
        selectionLocked={scope.selectionLocked}
        openDisabledReason={openDisabledReason}
        onFilter={scope.filterCommits}
        onSelect={scope.selectHistory}
        onLoadMore={() => void scope.loadMore()}
        onOpen={() => showView("changes")}
      >
      <div class={`${styles.content} ${sidebarOpen ? "" : styles.sidebarHidden}`}>
        {sidebarOpen ? (
          <FileTree
            files={files}
            totalFileCount={data.files.length}
            showSourceCommits={data.selectedCommitIds.length > 1}
            filter={state.filter}
            activeFileId={activeFileId}
            collapsedDirectories={state.collapsedDirectories}
            onFilter={(value) => dispatch({ type: "filter", value })}
            onToggleDirectory={(path) => dispatch({ type: "toggle-directory", path })}
            onSelectFile={selectFile}
          />
        ) : null}
        <DiffView
          fileNavigation={fileNavigation?.viewKey === viewKey ? fileNavigation : null}
          viewKey={viewKey}
          files={files}
          loading={scope.pending}
          error={data.files.length === 0 ? state.error : null}
          readOnly={scope.pending || scope.disabledReason !== null}
          emptyLabel={state.filter.trim() ? "No matching files" : scope.commitFilter.trim() && scope.selectedIds.length === 0 ? "No matching commits" : undefined}
          activeFileId={activeFileId}
          showSourceCommits={data.selectedCommitIds.length > 1}
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
          onVisibleFile={(fileId) => dispatch({ type: "visible-file", fileId })}
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
      </ReviewWorkspace>
      <ReviewActions
        repositoryRoot={data.repositoryRoot}
        draftCount={comments.length}
        submitting={scope.pending || state.phase === "submitting" || state.phase === "selecting"}
        disabledReason={scope.disabledReason}
        error={state.error}
        onApprove={(copyToClipboard) => void submit("approve", copyToClipboard)}
        onShare={(copyToClipboard) => void submit("share", copyToClipboard)}
      />
      {shortcutHelpOpen ? <ShortcutHelp onClose={() => setShortcutHelpOpen(false)} /> : null}
      {reloadOpen ? <ReloadDialog count={comments.length} editing={state.openLineId !== null}
        busy={scope.reloading} error={state.error}
        onCancel={() => setReloadOpen(false)} onReload={() => void reload()} /> : null}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
