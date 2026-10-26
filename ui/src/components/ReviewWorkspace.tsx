import { Fragment, type ComponentChildren } from "preact";
import { memo } from "preact/compat";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { fullMessageBody, summarizeCommitAuthors } from "../commitPresentation";
import { historyGraph, type GraphRow } from "../historyGraph";
import { clearFilterOnEscape, focusPaneFilter, paneOf } from "../panes";
import { matchesShortcut, shortcutTitle } from "../shortcuts";
import { toggleRangeEndpoint } from "../commitRange";
import { reviewBoundary } from "../reviewBoundary";
import { WORKTREE_COMMIT_ID, type HistoryCommit, type ReviewData } from "../types";
import type { ReviewView } from "../windowChrome/model";
import styles from "./ReviewWorkspace.module.css";

const LANE_WIDTH = 14;
const ROW_HEIGHT = 28;
const BASE_MARKER_HEIGHT = 20;
const LANE_COLORS = ["var(--blue)", "var(--green)", "#8250df", "#bf8700", "var(--red)", "#1b7c83"];

interface ReviewWorkspaceProps {
  review: ReviewData;
  commits: HistoryCommit[];
  visibleCommits: HistoryCommit[];
  selectedIds: string[];
  filter: string;
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  view: ReviewView;
  keyboardEnabled: boolean;
  selectionLocked: boolean;
  openDisabledReason: string | null;
  children: ComponentChildren;
  onFilter(value: string): void;
  onSelect(commitIds: string[]): void;
  onLoadMore(): void;
  onOpen(): void;
}

export function ReviewWorkspace(props: ReviewWorkspaceProps) {
  const list = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const [anchor, setAnchor] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [listHeight, setListHeight] = useState<number | null>(null);
  const query = props.filter.trim().toLocaleLowerCase();
  const visible = props.visibleCommits;
  const selected = props.selectedIds;
  const graph = useMemo(() => query === "" ? historyGraph(props.commits) : null, [props.commits, query]);
  const graphWidth = graph ? Math.max(1, ...graph.map((row) => row.width)) * LANE_WIDTH + 6 : 0;
  const inReview = useMemo(() => new Set(props.review.commits.map((commit) => commit.id)), [props.review.commits]);
  const selectedCommits = useMemo(() => props.commits.filter((commit) => selected.includes(commit.id)), [props.commits, selected]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const focusIndex = selected.length === 1 ? visible.findIndex((commit) => commit.id === selected[0])
    : cursor === null ? 0 : visible.findIndex((commit) => commit.id === cursor);
  const openReason = props.openDisabledReason ?? (selected.length === 0 ? "Select a commit" : null);

  const selectAt = useCallback((index: number, mode: "single" | "range" | "toggle") => {
    const commit = visible[index];
    if (!commit || props.selectionLocked) return;
    setCursor(commit.id);
    if (mode === "range") {
      props.onSelect([visible[anchor]?.id ?? commit.id, commit.id]);
      return;
    }
    setAnchor(index);
    props.onSelect(mode === "toggle"
      ? toggleRangeEndpoint(selected, commit.id)
      : [commit.id]);
  }, [anchor, visible, selected, props.onSelect, props.selectionLocked]);

  const rowActions = useRef({ selectAt, openOne: (_id: string) => undefined as void });
  rowActions.current = {
    selectAt,
    openOne: (id) => {
      if (!props.selectionLocked && inReview.has(id)) {
        props.onSelect([id]);
        props.onOpen();
      }
    },
  };
  const onRowClick = useCallback((index: number, event: MouseEvent) => {
    rowActions.current.selectAt(index, event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "single");
  }, []);
  const onRowOpen = useCallback((id: string) => rowActions.current.openOne(id), []);

  useLayoutEffect(() => {
    if (props.view !== "history" || !props.keyboardEnabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const scope = root.current;
      const typing = isTextEntryTarget(event.target);
      if (paneOf(event.target) !== "commits") return;
      if (matchesShortcut(event, "historyFilter", "native") || (!typing && matchesShortcut(event, "historyFilter", "slash"))) {
        event.preventDefault();
        focusPaneFilter(scope, "commits");
        return;
      }
      const step = matchesShortcut(event, "historyPrevious", "arrow") || (!typing && matchesShortcut(event, "historyPrevious", "vim")) ? -1
        : matchesShortcut(event, "historyNext", "arrow") || (!typing && matchesShortcut(event, "historyNext", "vim")) ? 1 : 0;
      const extend = matchesShortcut(event, "historyExtend", "up") || matchesShortcut(event, "historyExtend", "down");
      const pageRows = Math.max(1, Math.floor((list.current?.clientHeight ?? 0) / ROW_HEIGHT) - 1);
      const target = step !== 0 || extend ? (focusIndex < 0 ? 0 : focusIndex + (step || (matchesShortcut(event, "historyExtend", "up") ? -1 : 1)))
        : matchesShortcut(event, "historyPageUp") ? Math.max(0, focusIndex) - pageRows
          : matchesShortcut(event, "historyPageDown") ? Math.max(0, focusIndex) + pageRows
            : !typing && matchesShortcut(event, "historyFirst") ? 0
              : !typing && matchesShortcut(event, "historyLast") ? visible.length - 1 : null;
      if (target !== null) {
        event.preventDefault();
        const index = Math.min(visible.length - 1, Math.max(0, target));
        selectAt(index, extend ? "range" : "single");
        if (index >= visible.length - 1 && props.hasMore && !props.loading && query === "") props.onLoadMore();
        return;
      }
      if (matchesShortcut(event, "historyOpen") && !typing) {
        event.preventDefault();
        if (openReason === null) props.onOpen();
      }
      if (!typing && matchesShortcut(event, "historyMessage")) {
        event.preventDefault();
        setMessageOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [props.view, props.keyboardEnabled, props.hasMore, props.loading, props.onLoadMore, props.onOpen, focusIndex, visible, query, selectAt, openReason]);

  useEffect(() => {
    const id = selected[selected.length - 1];
    if (id) list.current?.querySelector<HTMLElement>(`[data-commit-id="${id}"]`)?.scrollIntoView?.({ block: "nearest" });
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

  const boundary = reviewBoundary(props.review, props.commits, visible);
  const baseLanes = boundary?.index === null || boundary === null ? []
    : graph?.[boundary.index]?.before ?? graph?.at(-1)?.after ?? [];
  const baseMarker = boundary?.index == null ? null
    : <ReviewBase label={boundary.label} lanes={baseLanes} graphWidth={graphWidth} />;
  return (
    <section ref={root} data-view={props.view} class={`${styles.workspace} ${props.view === "changes" ? styles.changes : ""}`}
      aria-label={props.view === "changes" ? "Changes" : "History"}
      style={props.view !== "history" || listHeight === null ? undefined : { gridTemplateRows: `${listHeight}px auto auto minmax(0, 1fr)` }}>
      {props.view !== "history" ? null : <>
        <div class={styles.commitsPane} data-pane="commits" tabIndex={-1}>
          <div class={styles.toolbar}>
            <input class={styles.filter} type="search" aria-label="Filter commits"
              placeholder="Filter commits by message, author, hash or ref..." value={props.filter} disabled={props.selectionLocked}
              onInput={(event) => props.onFilter(event.currentTarget.value)}
              onKeyDown={(event) => clearFilterOnEscape(event, () => props.onFilter(""))} />
            <span class={styles.count}>{query === "" ? `${props.commits.length}${props.hasMore ? "+" : ""} commits` : `${visible.length} of ${props.commits.length} commits`}</span>
          </div>
          <div ref={list} class={styles.list} role="listbox" aria-label="Commits" aria-multiselectable="true">
            {visible.map((commit, index) => <Fragment key={commit.id}>
              {boundary?.index === index ? baseMarker : null}
              <CommitRow commit={commit} index={index}
              graphRow={graph ? graph[index]! : null} graphWidth={graphWidth} selected={selectedSet.has(commit.id)}
              outside={!inReview.has(commit.id)}
              onClick={onRowClick} onOpen={onRowOpen} />
            </Fragment>)}
            {boundary?.index === visible.length ? baseMarker : null}
            {boundary && boundary.remaining > 0 ? <div class={styles.notice}>
              base: {boundary.label} ({boundary.remaining} review {boundary.remaining === 1 ? "commit" : "commits"} not loaded)
            </div> : null}
            {props.error ? <div class={styles.notice} role="alert">{props.error}</div> : null}
            {props.loading ? <div class={styles.notice} role="status">Loading history...</div> : null}
            {!props.loading && props.hasMore ? <button type="button" class={styles.more} onClick={props.onLoadMore}>Load more commits</button> : null}
          </div>
        </div>
        <div class={styles.divider} role="separator" aria-orientation="horizontal" aria-label="Resize commit list" onPointerDown={startResize} />
        <CommitStrip commits={selectedCommits} messageOpen={messageOpen} openReason={openReason}
          onToggleMessage={() => setMessageOpen((value) => !value)} onOpen={props.onOpen} />
      </>}
      {props.children}
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
  onClick(index: number, event: MouseEvent): void;
  onOpen(id: string): void;
}

function ReviewBase({ label, lanes, graphWidth }: { label: string; lanes: (string | null)[]; graphWidth: number }) {
  return (
    <div class={styles.base} role="separator" aria-label={`Review base ${label}`} aria-orientation="horizontal" style={{ gridTemplateColumns: `${graphWidth}px minmax(0, 1fr)` }}>
      {graphWidth > 0 ? <svg class={styles.graph} width={graphWidth} height={BASE_MARKER_HEIGHT} aria-hidden="true">
        {lanes.map((lane, index) => lane === null ? null : <path key={index} d={`M${index * LANE_WIDTH + LANE_WIDTH / 2 + 3} 0V${BASE_MARKER_HEIGHT}`} stroke={LANE_COLORS[index % LANE_COLORS.length]} />)}
      </svg> : <span />}
      <span class={styles.baseLabel}>base: {label}</span>
    </div>
  );
}

const CommitRow = memo(function CommitRow({ commit, index, graphRow, graphWidth, selected, outside, onClick, onOpen }: CommitRowProps) {
  return (
    <Fragment>
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
        <span class={styles.author} title={commit.author}>{commit.author}</span>
        <span class={styles.email} title={commit.authorEmail}>{commit.authorEmail}</span>
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
              <span>{single.author}{single.authorEmail ? ` <${single.authorEmail}>` : ""}</span>
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

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']") !== null;
}
