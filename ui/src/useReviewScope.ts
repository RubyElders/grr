import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { ReviewBackend } from "./backend";
import { initialState, reviewReducer } from "./state";
import { filesInTreeOrder } from "./tree";
import type { HistoryCommit, ReviewData } from "./types";
import type { ReviewView } from "./windowChrome/model";
import { consecutiveCommitIds } from "./commitRange";

const PAGE_SIZE = 200;

export function useReviewScope(backend: ReviewBackend, historyEnabled: boolean) {
  const [state, dispatch] = useReducer(reviewReducer, initialState);
  const [baseReview, setBaseReview] = useState<ReviewData | null>(null);
  const [initialView, setInitialView] = useState<ReviewView>("changes");
  const [commits, setCommits] = useState<HistoryCommit[]>([]);
  const [headRef, setHeadRef] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [commitFilter, setCommitFilter] = useState("");
  const [choice, setChoice] = useState<string[] | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const reloadBusy = useRef(false);
  const loadedKey = useRef("");
  const serverKey = useRef("");
  const selectionQueue = useRef<Promise<unknown>>(Promise.resolve());
  const historyStarted = useRef(false);

  useEffect(() => {
    let current = true;
    Promise.all([backend.getReview(), backend.getInitialView()]).then(([review, view]) => {
      if (!current) return;
      const ids = review.selectedCommitIds.length === 0 ? null : review.selectedCommitIds;
      loadedKey.current = scopeKey(ids);
      serverKey.current = loadedKey.current;
      setBaseReview({ ...review, files: [] });
      setChoice(ids);
      setInitialView(view);
      dispatch({ type: "loaded", data: { ...review, files: filesInTreeOrder(review.files) } });
    }, (error: unknown) => {
      if (current) dispatch({ type: "failed", error: errorMessage(error) });
    });
    return () => { current = false; };
  }, [backend]);

  const loadHistory = useCallback((offset: number) => {
    setHistoryLoading(true);
    return backend.getHistory(offset, PAGE_SIZE).then((page) => {
      setCommits((previous) => offset === 0 ? page.commits : [...previous, ...page.commits]);
      setHeadRef(page.headRef);
      setHasMore(page.hasMore);
      setHistoryError(null);
    }, (error: unknown) => setHistoryError(errorMessage(error)))
      .finally(() => setHistoryLoading(false));
  }, [backend]);

  useEffect(() => {
    if ((!historyEnabled && initialView !== "history") || historyStarted.current) return;
    historyStarted.current = true;
    void loadHistory(0);
  }, [historyEnabled, initialView, loadHistory]);

  const query = commitFilter.trim().toLocaleLowerCase();
  const matchingCommits = useMemo(() => query === "" ? commits : commits.filter((commit) =>
    [commit.message, commit.author, commit.id, ...commit.refs].some((value) => value.toLocaleLowerCase().includes(query)),
  ), [commits, query]);
  const range = useMemo(() => {
    const requested = choice === null
      ? query === "" ? null : matchingCommits.map((commit) => commit.id)
      : query === "" ? choice : choice.filter((id) => matchingCommits.some((commit) => commit.id === id));
    if (requested === null) return { ids: null, error: null };
    const catalog = commits.length > 0 ? commits : baseReview?.commits ?? [];
    try {
      return { ids: consecutiveCommitIds(catalog, requested), error: null };
    } catch (error) {
      return { ids: requested, error: errorMessage(error) };
    }
  }, [choice, query, matchingCommits, commits, baseReview]);
  const ids = range.ids;
  const visibleCommits = useMemo(() => query === "" || range.error ? matchingCommits
    : commits.filter((commit) => ids?.includes(commit.id)), [query, range.error, matchingCommits, commits, ids]);
  const key = scopeKey(ids);
  const selectedIds = useMemo(() => ids ?? baseReview?.commits.map((commit) => commit.id) ?? [], [ids, baseReview]);
  const reviewable = ids === null || (ids.length > 0 && ids.every((id) => baseReview?.commits.some((commit) => commit.id === id)));
  const unresolved = baseReview !== null && (key !== loadedKey.current || (reviewable && key !== serverKey.current));
  const pending = reloading || (unresolved && failedKey !== key && !range.error);
  const disabledReason = range.error ?? (ids?.length === 0 ? "No commits selected"
    : !reviewable ? `Only commits after ${baseReview?.comparison.baseRef} can be reviewed`
      : failedKey === key ? "Could not load selected commits" : null);

  useEffect(() => {
    if (!baseReview) return;
    if (range.error) {
      dispatch({ type: "submit-failed", error: range.error });
      return;
    }
    if (key === loadedKey.current && (!reviewable || key === serverKey.current)) {
      dispatch({ type: "selection-cancelled" });
      return;
    }
    let current = true;
    setFailedKey(null);
    dispatch({ type: "selection-started" });
    const timer = setTimeout(async () => {
      try {
        let review: ReviewData;
        if (ids === null || reviewable) {
          const request = selectionQueue.current.then(() => {
            if (!current) return null;
            serverKey.current = key;
            return backend.selectCommits(ids ?? []);
          });
          selectionQueue.current = request.catch(() => undefined);
          const loaded = await request;
          if (!loaded) return;
          review = loaded;
        } else if (ids.length === 0) {
          review = { ...baseReview, selectedCommitIds: [], commits: [], files: [] };
        } else {
          review = {
            ...baseReview,
            commits: [...baseReview.commits, ...commits.filter((commit) => ids.includes(commit.id)
              && !baseReview.commits.some((known) => known.id === commit.id))],
            selectedCommitIds: ids,
            files: await backend.getHistoryFiles(ids),
          };
        }
        if (!current) return;
        loadedKey.current = key;
        dispatch({ type: "selection-loaded", data: {
          ...review, selectedCommitIds: ids ?? [], files: filesInTreeOrder(review.files),
        } });
      } catch (error) {
        if (current) {
          setFailedKey(key);
          dispatch({ type: "submit-failed", error: errorMessage(error) });
        }
      }
    }, 150);
    return () => { current = false; clearTimeout(timer); };
  }, [backend, baseReview, key, range.error]);

  const reload = useCallback(async () => {
    if (reloadBusy.current || state.phase !== "ready" || pending) return false;
    reloadBusy.current = true;
    setReloading(true);
    try {
      const review = await backend.reloadReview();
      const ids = review.selectedCommitIds.length === 0 ? null : review.selectedCommitIds;
      loadedKey.current = scopeKey(ids);
      serverKey.current = loadedKey.current;
      setFailedKey(null);
      setChoice(ids);
      setCommitFilter("");
      setBaseReview({ ...review, files: [] });
      dispatch({ type: "selection-loaded", data: { ...review, files: filesInTreeOrder(review.files) } });
      if (historyStarted.current) await loadHistory(0);
      return true;
    } catch (error) {
      dispatch({ type: "submit-failed", error: errorMessage(error) });
      return false;
    } finally {
      reloadBusy.current = false;
      setReloading(false);
    }
  }, [backend, state.phase, pending, loadHistory]);
  const selectionLocked = reloading || state.openLineId !== null || Object.keys(state.drafts).length > 0 || state.phase === "submitting";
  const selectCommits = useCallback((commitIds: string[]) => {
    if (!selectionLocked) setChoice(commitIds.length === 0 ? null : commitIds);
  }, [selectionLocked]);
  const selectHistory = useCallback((commitIds: string[]) => {
    if (!selectionLocked) setChoice(commitIds);
  }, [selectionLocked]);
  const filterCommits = useCallback((value: string) => {
    if (selectionLocked) return;
    setCommitFilter(value);
    setChoice(null);
  }, [selectionLocked]);

  const data = useMemo(() => {
    if (!state.data || !baseReview) return null;
    const available = query === "" ? baseReview.commits : visibleCommits;
    const selected = commits.filter((commit) => selectedIds.includes(commit.id)
      && !available.some((known) => known.id === commit.id));
    return {
      ...state.data,
      commits: [...available, ...selected],
      selectedCommitIds: ids ?? [],
      files: unresolved ? [] : state.data.files,
    };
  }, [state.data, baseReview, query, visibleCommits, commits, key, unresolved]);

  return {
    state, dispatch, data, baseReview, initialView, pending, disabledReason, selectionLocked, reload, reloading,
    selectedIds, selectCommits, selectHistory, commitFilter, filterCommits,
    commits, visibleCommits, headRef, hasMore, historyLoading, historyError,
    loadMore: () => loadHistory(commits.length),
  };
}

function scopeKey(ids: string[] | null): string {
  return ids === null ? "comparison" : `commits:${[...new Set(ids)].sort().join(",")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
