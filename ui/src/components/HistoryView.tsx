import { Fragment } from "preact";
import { memo } from "preact/compat";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ReviewBackend } from "../backend";
import { adjacentMatch, findCodeMatches, type CodeMatch } from "../codeSearch";
import { fullMessageBody, summarizeCommitAuthors } from "../commitPresentation";
import { historyGraph, type GraphRow } from "../historyGraph";
import { clearFilterOnEscape, cyclePane, focusPane, focusPaneFilter, paneOf } from "../panes";
import { matchesShortcut, shortcutTitle } from "../shortcuts";
import { filesInTreeOrder } from "../tree";
import { WORKTREE_COMMIT_ID, type FileDiff, type HistoryCommit, type ReviewData } from "../types";
import { DiffView } from "./DiffView";
import { FileTree } from "./FileTree";
import { FindPopover } from "./FindPopover";
import styles from "./HistoryView.module.css";

const PAGE_SIZE = 200;
const LANE_WIDTH = 14;
const ROW_HEIGHT = 28;
const BASE_MARKER_HEIGHT = 20;
const LANE_COLORS = ["var(--blue)", "var(--green)", "#8250df", "#bf8700", "var(--red)", "#1b7c83"];
const NO_DRAFTS = {};
const NO_MATCHES: CodeMatch[] = [];

interface HistoryViewProps {
  backend: ReviewBackend;
  review: ReviewData;
  hidden: boolean;
  keyboardEnabled: boolean;
  sidebarOpen: boolean;
  openDisabledReason: string | null;
  onHeadRef(headRef: string): void;
  onOpen(commitIds: string[]): void;
}

export function HistoryView(props: HistoryViewProps) {
  const { backend, onHeadRef } = props;
  const list = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const [commits, setCommits] = useState<HistoryCommit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState(0);
  const [messageOpen, setMessageOpen] = useState(false);
  const [files, setFiles] = useState<FileDiff[] | null>(null);
  const [shownKey, setShownKey] = useState("");
  const [filesError, setFilesError] = useState<string | null>(null);
  const [treeFilter, setTreeFilter] = useState("");
  const [collapsedDirectories, setCollapsedDirectories] = useState<ReadonlySet<string>>(new Set());
  const [collapsedFiles, setCollapsedFiles] = useState<ReadonlySet<string>>(new Set());
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [fileNavigation, setFileNavigation] = useState<{ fileId: string; requestId: number } | null>(null);
  const [listHeight, setListHeight] = useState<number | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(-1);

  const loadPage = useCallback((offset: number) => {
    setLoading(true);
    return backend.getHistory(offset, PAGE_SIZE).then(
      (page) => {
        setCommits((current) => (offset === 0 ? page.commits : [...current, ...page.commits]));
        setHasMore(page.hasMore);
        setError(null);
        onHeadRef(page.headRef);
        return page.commits;
      },
      (failure: unknown) => {
        setError(errorMessage(failure));
        return [];
      },
    ).finally(() => setLoading(false));
  }, [backend, onHeadRef]);

  useEffect(() => {
    void loadPage(0).then((page) => {
      const first = page[0];
      if (first) setSelected((current) => (current.length === 0 ? [first.id] : current));
    });
  }, [loadPage]);

  const query = filter.trim().toLocaleLowerCase();
  const visible = useMemo(() => (query === "" ? commits : commits.filter((commit) => matchesCommit(commit, query))), [commits, query]);
  const graph = useMemo(() => (query === "" ? historyGraph(commits) : null), [commits, query]);
  const graphWidth = graph ? Math.max(1, ...graph.map((row) => row.width)) * LANE_WIDTH + 6 : 0;
  const inReview = useMemo(() => new Set(props.review.commits.map((commit) => commit.id)), [props.review.commits]);
  const selectedCommits = useMemo(() => commits.filter((commit) => selected.includes(commit.id)), [commits, selected]);
  const selectionKey = selectedCommits.map((commit) => commit.id).join(",");

  useEffect(() => {
    if (selectionKey === "") {
      setFiles(null);
      setShownKey("");
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      backend.getHistoryFiles(selectionKey.split(",")).then(
        (loaded) => {
          if (!current) return;
          const ordered = filesInTreeOrder(loaded);
          setFiles(ordered);
          setFilesError(null);
          setActiveFileId(ordered[0]?.id ?? null);
          setFileNavigation(null);
          setCollapsedFiles(new Set());
          setShownKey(selectionKey);
        },
        (failure: unknown) => {
          if (current) setFilesError(errorMessage(failure));
        },
      );
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [backend, selectionKey]);

  const selectAt = useCallback((index: number, mode: "single" | "range" | "toggle") => {
    const commit = visible[index];
    if (!commit) return;
    if (mode === "range") {
      setSelected(rangeSelection(visible, anchor, index));
      return;
    }
    setAnchor(index);
    if (mode === "toggle") {
      setSelected((current) => (current.includes(commit.id)
        ? current.filter((id) => id !== commit.id)
        : [...current, commit.id]));
      return;
    }
    setSelected([commit.id]);
  }, [anchor, visible]);

  const focusIndex = visible.findIndex((commit) => commit.id === selected[selected.length - 1]);
  const openReason = props.openDisabledReason ?? (
    selectedCommits.length === 0
      ? "Select a commit"
      : selectedCommits.every((commit) => inReview.has(commit.id))
        ? null
        : `Only commits after ${props.review.comparison.baseRef} can be reviewed`
  );
  const open = useCallback(() => {
    if (openReason === null) props.onOpen(selectedCommits.map((commit) => commit.id));
  }, [openReason, props.onOpen, selectedCommits]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const rowActions = useRef({ selectAt, openOne: (_id: string) => undefined as void });
  rowActions.current = {
    selectAt,
    openOne: (id) => {
      if (props.openDisabledReason === null && inReview.has(id)) props.onOpen([id]);
    },
  };
  const onRowClick = useCallback((index: number, event: MouseEvent) => {
    rowActions.current.selectAt(index, event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "single");
  }, []);
  const onRowOpen = useCallback((id: string) => rowActions.current.openOne(id), []);
  const shownCount = shownKey === "" ? 0 : shownKey.split(",").length;
  const findMatches = useMemo(() => (findOpen ? findCodeMatches(files ?? [], findQuery) : NO_MATCHES), [files, findOpen, findQuery]);
  const activeFindIndex = findIndex < findMatches.length ? findIndex : findMatches.length > 0 ? 0 : -1;
  const closeFind = useCallback(() => {
    setFindOpen(false);
    focusPane(root.current, "diff");
  }, []);

  useEffect(() => {
    if (!props.hidden) focusPane(root.current, "commits");
  }, [props.hidden]);

  useLayoutEffect(() => {
    if (props.hidden || !props.keyboardEnabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const scope = root.current;
      const typing = isTextEntryTarget(event.target);
      const onControl = (event.target as Element | null)?.closest?.("button, a") != null;
      const inFind = (event.target as Element | null)?.closest?.("[role='search']") != null;
      if (findOpen) {
        const findInput = (event.target as Element | null)?.matches?.("[data-find-input]") === true;
        const next = matchesShortcut(event, "nextMatch") && (!matchesShortcut(event, "nextMatch", "enter") || findInput);
        const previous = matchesShortcut(event, "previousMatch") && (!matchesShortcut(event, "previousMatch", "enter") || findInput);
        if (next || previous) {
          event.preventDefault();
          setFindIndex(adjacentMatch(activeFindIndex, findMatches.length, previous ? -1 : 1));
          return;
        }
        if (matchesShortcut(event, "dismiss") && (inFind || !typing)) {
          event.preventDefault();
          closeFind();
          return;
        }
      }
      if (inFind) return;
      const nextPane = matchesShortcut(event, "nextPane");
      if (nextPane || matchesShortcut(event, "previousPane")) {
        event.preventDefault();
        cyclePane(scope, paneOf(event.target), nextPane ? 1 : -1);
        return;
      }
      const pane = paneOf(event.target) ?? "commits";
      if (matchesShortcut(event, "historyFilter", "native") || (!typing && matchesShortcut(event, "historyFilter", "slash"))) {
        event.preventDefault();
        if (pane !== "diff") {
          focusPaneFilter(scope, pane);
        } else if (findOpen) {
          const input = scope?.querySelector<HTMLInputElement>("[data-find-input]");
          input?.focus();
          input?.select();
        } else {
          setFindOpen(true);
        }
        return;
      }
      const arrowUp = matchesShortcut(event, "historyPrevious", "arrow");
      const arrowDown = matchesShortcut(event, "historyNext", "arrow");
      const vimUp = !typing && matchesShortcut(event, "historyPrevious", "vim");
      const vimDown = !typing && matchesShortcut(event, "historyNext", "vim");
      const fileStep = pane === "files" && (arrowUp || vimUp) ? -1
        : pane === "files" && (arrowDown || vimDown) ? 1
          : pane === "diff" && vimUp ? -1
            : pane === "diff" && vimDown ? 1
              : !typing && matchesShortcut(event, "previousDiffFile") ? -1
                : !typing && matchesShortcut(event, "nextDiffFile") ? 1
                  : 0;
      if (fileStep !== 0) {
        event.preventDefault();
        if (!files || files.length === 0) return;
        const current = files.findIndex((file) => file.id === activeFileId);
        const next = files[Math.min(files.length - 1, Math.max(0, current < 0 ? 0 : current + fileStep))]!;
        setActiveFileId(next.id);
        setFileNavigation((previous) => ({ fileId: next.id, requestId: (previous?.requestId ?? 0) + 1 }));
        return;
      }
      if (pane === "commits") {
        const extendUp = matchesShortcut(event, "historyExtend", "up");
        const extendDown = matchesShortcut(event, "historyExtend", "down");
        const step = arrowUp || vimUp || extendUp ? -1 : arrowDown || vimDown || extendDown ? 1 : 0;
        const pageRows = Math.max(1, Math.floor((list.current?.clientHeight ?? 0) / ROW_HEIGHT) - 1);
        const target = step !== 0 ? (focusIndex < 0 ? 0 : focusIndex + step)
          : matchesShortcut(event, "historyPageUp") ? Math.max(0, focusIndex) - pageRows
            : matchesShortcut(event, "historyPageDown") ? Math.max(0, focusIndex) + pageRows
              : !typing && matchesShortcut(event, "historyFirst") ? 0
                : !typing && matchesShortcut(event, "historyLast") ? visible.length - 1
                  : null;
        if (target !== null) {
          event.preventDefault();
          const index = Math.min(visible.length - 1, Math.max(0, target));
          selectAt(index, extendUp || extendDown ? "range" : "single");
          if (index >= visible.length - 1 && hasMore && !loading && query === "") void loadPage(commits.length);
          return;
        }
        if (matchesShortcut(event, "historyOpen") && !onControl) {
          event.preventDefault();
          open();
          return;
        }
      }
      if (!typing && matchesShortcut(event, "historyMessage")) {
        event.preventDefault();
        setMessageOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [activeFileId, activeFindIndex, closeFind, commits.length, files, findMatches.length, findOpen, focusIndex, hasMore, loadPage, loading, open, props.hidden, props.keyboardEnabled, query, selectAt, visible]);

  useEffect(() => {
    const id = selected[selected.length - 1];
    if (!id) return;
    list.current?.querySelector<HTMLElement>(`[data-commit-id="${id}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const startResize = (event: PointerEvent) => {
    const section = root.current;
    const divider = event.currentTarget as HTMLElement;
    if (!section) return;
    event.preventDefault();
    divider.setPointerCapture?.(event.pointerId);
    const top = section.getBoundingClientRect().top;
    const limit = section.clientHeight - 160;
    const move = (moveEvent: PointerEvent) => setListHeight(Math.max(160, Math.min(limit, moveEvent.clientY - top)));
    const stop = () => {
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", stop);
    };
    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", stop);
  };

  const worktreeOnly = (props.review.selectedCommitIds.length === 1 && props.review.selectedCommitIds[0] === WORKTREE_COMMIT_ID)
    || props.review.commits.every((commit) => commit.id === WORKTREE_COMMIT_ID);
  const mergeBaseId = worktreeOnly ? props.review.comparison.headId : props.review.comparison.mergeBaseId;
  return (
    <section
      ref={root}
      data-view="history"
      class={`${styles.history} ${props.hidden ? styles.hidden : ""}`}
      aria-label="History"
      style={listHeight === null ? undefined : { gridTemplateRows: `${listHeight}px auto auto minmax(0, 1fr)` }}
    >
      <div class={styles.commitsPane} data-pane="commits" tabIndex={-1}>
        <div class={styles.toolbar}>
          <input
            class={styles.filter}
            type="search"
            aria-label="Filter commits"
            placeholder="Filter commits by message, author, hash or ref..."
            value={filter}
            onInput={(event) => setFilter(event.currentTarget.value)}
            onKeyDown={(event) => clearFilterOnEscape(event, () => setFilter(""))}
          />
          <span class={styles.count}>{query === "" ? `${commits.length}${hasMore ? "+" : ""} commits` : `${visible.length} of ${commits.length} commits`}</span>
        </div>
        <div ref={list} class={styles.list} role="listbox" aria-label="Commits" aria-multiselectable="true">
          {visible.map((commit, index) => (
            <CommitRow
              key={commit.id}
              commit={commit}
              index={index}
              graphRow={graph ? graph[index]! : null}
              graphWidth={graphWidth}
              selected={selectedSet.has(commit.id)}
              outside={!inReview.has(commit.id)}
              baseRef={commit.id === mergeBaseId ? worktreeOnly ? "HEAD" : props.review.comparison.baseRef : null}
              onClick={onRowClick}
              onOpen={onRowOpen}
            />
          ))}
          {error ? <div class={styles.notice} role="alert">{error}</div> : null}
          {loading ? <div class={styles.notice} role="status">Loading history...</div> : null}
          {!loading && hasMore ? (
            <button type="button" class={styles.more} onClick={() => void loadPage(commits.length)}>Load more commits</button>
          ) : null}
        </div>
      </div>
      <div class={styles.divider} role="separator" aria-orientation="horizontal" aria-label="Resize commit list" onPointerDown={startResize} />
      <CommitStrip
        commits={selectedCommits}
        messageOpen={messageOpen}
        openReason={openReason}
        onToggleMessage={() => setMessageOpen((value) => !value)}
        onOpen={open}
      />
      <div class={`${styles.details} ${props.sidebarOpen ? "" : styles.noSidebar} ${files !== null && shownKey !== selectionKey ? styles.stale : ""}`}>
        {filesError ? <div class={styles.placeholder} role="alert">{filesError}</div>
          : files === null ? <div class={styles.placeholder} role="status">{selectedCommits.length === 0 ? "Select a commit to see its changes." : "Loading changes..."}</div>
            : (
              <>
                {props.sidebarOpen ? (
                  <FileTree
                    files={files}
                    showSourceCommits={shownCount > 1}
                    filter={treeFilter}
                    activeFileId={activeFileId}
                    collapsedDirectories={collapsedDirectories}
                    onFilter={setTreeFilter}
                    onToggleDirectory={(path) => setCollapsedDirectories((current) => toggled(current, path))}
                    onSelectFile={(fileId) => {
                      setActiveFileId(fileId);
                      setFileNavigation((previous) => ({ fileId, requestId: (previous?.requestId ?? 0) + 1 }));
                    }}
                  />
                ) : null}
                <DiffView
                  viewKey={`history:${shownKey}`}
                  files={files}
                  activeFileId={activeFileId}
                  fileNavigation={fileNavigation}
                  showSourceCommits={shownCount > 1}
                  readOnly
                  collapsedFiles={collapsedFiles}
                  openLineId={null}
                  drafts={NO_DRAFTS}
                  searchMatches={findMatches}
                  activeSearchMatchIndex={findOpen ? activeFindIndex : -1}
                  onToggleFile={(fileId) => setCollapsedFiles((current) => toggled(current, fileId))}
                  onOpenComment={() => undefined}
                  onCloseComment={() => undefined}
                  onSaveComment={() => undefined}
                  onDeleteComment={() => undefined}
                  onVisibleFile={setActiveFileId}
                />
              </>
            )}
        {findOpen ? (
          <FindPopover
            query={findQuery}
            activeIndex={activeFindIndex}
            matchCount={findMatches.length}
            onQuery={(value) => {
              setFindQuery(value);
              setFindIndex(0);
            }}
            onPrevious={() => setFindIndex(adjacentMatch(activeFindIndex, findMatches.length, -1))}
            onNext={() => setFindIndex(adjacentMatch(activeFindIndex, findMatches.length, 1))}
            onClose={closeFind}
          />
        ) : null}
      </div>
    </section>
  );
}

interface CommitRowProps {
  commit: HistoryCommit;
  index: number;
  graphRow: GraphRow | null;
  graphWidth: number;
  selected: boolean;
  outside: boolean;
  baseRef: string | null;
  onClick(index: number, event: MouseEvent): void;
  onOpen(id: string): void;
}

const CommitRow = memo(function CommitRow({ commit, index, graphRow, graphWidth, selected, outside, baseRef, onClick, onOpen }: CommitRowProps) {
  return (
    <Fragment>
      {baseRef === null ? null : (
        <div class={styles.base} role="separator" aria-label={`Review base ${baseRef}`} aria-orientation="horizontal" style={{ gridTemplateColumns: `${graphWidth}px minmax(0, 1fr)` }}>
          {graphRow ? <svg class={styles.graph} width={graphWidth} height={BASE_MARKER_HEIGHT} aria-hidden="true">
            {graphRow.before.map((lane, index) => lane === null ? null : <path key={index} d={`M${index * LANE_WIDTH + LANE_WIDTH / 2 + 3} 0V${BASE_MARKER_HEIGHT}`} stroke={LANE_COLORS[index % LANE_COLORS.length]} />)}
          </svg> : <span />}
          <span class={styles.baseLabel}>base: {baseRef}</span>
        </div>
      )}
      <div
        role="option"
        data-commit-id={commit.id}
        aria-selected={selected}
        class={`${styles.row} ${outside ? styles.outside : ""}`}
        onMouseDown={(event) => {
          if (event.shiftKey) event.preventDefault();
        }}
        onClick={(event) => onClick(index, event)}
        onDblClick={() => onOpen(commit.id)}
      >
        {graphRow ? <GraphCell row={graphRow} commitId={commit.id} width={graphWidth} /> : <span />}
        <span class={styles.summary}>
          {commit.refs.map((ref) => <span key={ref} class={styles.ref}>{ref}</span>)}
          <span class={styles.summaryText}>{commit.summary}</span>
          <MoreLines commit={commit} />
        </span>
        <span class={styles.author}>{commit.author}</span>
        <span class={styles.date}>{formatDate(commit.authoredAt)}</span>
        <code class={styles.hash}>{commit.id === WORKTREE_COMMIT_ID ? "" : commit.shortId.slice(0, 7)}</code>
      </div>
    </Fragment>
  );
});

function MoreLines({ commit }: { commit: HistoryCommit }) {
  const body = commit.id === WORKTREE_COMMIT_ID ? "" : fullMessageBody(commit);
  if (!body) return null;
  const lines = body.split("\n").length;
  const label = `${lines} more ${lines === 1 ? "line" : "lines"} in the message`;
  return <span class={styles.moreLines} title={label} aria-label={label}>...</span>;
}

function CommitStrip({ commits, messageOpen, openReason, onToggleMessage, onOpen }: {
  commits: HistoryCommit[];
  messageOpen: boolean;
  openReason: string | null;
  onToggleMessage(): void;
  onOpen(): void;
}) {
  const single = commits.length === 1 ? commits[0]! : null;
  const body = single ? fullMessageBody(single) : "";
  return (
    <div class={styles.strip}>
      <div class={styles.stripText}>
        {single ? (
          <>
            <strong class={styles.stripTitle}>{single.summary}</strong>
            <span class={styles.stripMeta}>
              {single.id === WORKTREE_COMMIT_ID ? null : <code>{single.shortId.slice(0, 7)}</code>}
              <span>{single.author}</span>
              <span>{formatDate(single.authoredAt)}</span>
              {single.parentIds.length > 0 ? <span>parent {single.parentIds.map((id) => id.slice(0, 7)).join(", ")}</span> : null}
              {single.refs.length > 0 ? <span>refs {single.refs.join(", ")}</span> : null}
              {body ? <button type="button" class={styles.link} aria-expanded={messageOpen} onClick={onToggleMessage}>{messageOpen ? "Hide message" : "Show message"}</button> : null}
            </span>
            {messageOpen && body ? <pre class={styles.message}>{body}</pre> : null}
          </>
        ) : commits.length > 1 ? (
          <>
            <strong class={styles.stripTitle}>{commits.length} commits selected</strong>
            <span class={styles.stripMeta}>
              <code>{commits[commits.length - 1]!.shortId.slice(0, 7)}..{commits[0]!.shortId.slice(0, 7)}</code>
              <span>{summarizeCommitAuthors(commits)}</span>
            </span>
          </>
        ) : <span class={styles.stripMeta}>No commit selected</span>}
      </div>
      <button type="button" class={styles.open} disabled={openReason !== null} title={openReason ?? `Open in Changes (${shortcutTitle("historyOpen")})`} onClick={onOpen}>
        Open in Changes
      </button>
    </div>
  );
}

function GraphCell({ row, commitId, width }: { row: GraphRow; commitId: string; width: number }) {
  const x = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2 + 3;
  const middle = ROW_HEIGHT / 2;
  const color = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];
  const worktree = commitId === WORKTREE_COMMIT_ID;
  return (
    <svg class={styles.graph} width={width} height={ROW_HEIGHT} aria-hidden="true">
      {row.before.map((lane, index) => {
        if (lane === null) return null;
        return lane === commitId
          ? <path key={index} d={curve(x(index), 0, x(row.column), middle)} stroke={color(index)} />
          : <path key={index} d={`M${x(index)} 0V${ROW_HEIGHT}`} stroke={color(index)} />;
      })}
      {row.parentColumns.map((lane) => (
        <path key={`p${lane}`} d={curve(x(row.column), middle, x(lane), ROW_HEIGHT)} stroke={color(lane)} />
      ))}
      <circle
        cx={x(row.column)}
        cy={middle}
        r={4}
        fill={worktree ? "var(--bg)" : color(row.column)}
        stroke={color(row.column)}
        stroke-width={worktree ? 2 : 0}
      />
    </svg>
  );
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) return `M${x1} ${y1}V${y2}`;
  const mid = (y1 + y2) / 2;
  return `M${x1} ${y1}C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
}

function rangeSelection(commits: HistoryCommit[], anchor: number, focus: number): string[] {
  const [from, to] = anchor < focus ? [anchor, focus] : [focus, anchor];
  const focused = commits[focus]!.id;
  return [...commits.slice(from, to + 1).map((commit) => commit.id).filter((id) => id !== focused), focused];
}

function matchesCommit(commit: HistoryCommit, query: string): boolean {
  return [commit.summary, commit.author, commit.id, ...commit.refs]
    .some((value) => value.toLocaleLowerCase().includes(query));
}

function toggled(set: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']") !== null;
}
