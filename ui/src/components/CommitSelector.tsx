import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { commitContext, commitNavigationTarget, commitSummaryContext, fullMessageBody, hasGroupedCommitView, type CommitContext } from "../commitPresentation";
import { WORKTREE_COMMIT_ID, type CommitSummary, type ReviewData } from "../types";
import { matchesShortcut } from "../shortcuts";
import { Icon } from "./Icon";
import styles from "./CommitSelector.module.css";

interface CommitSelectorProps {
  data: ReviewData;
  open: boolean;
  loading: boolean;
  disabled: boolean;
  nativeHeader?: boolean;
  onOpenChange(open: boolean): void;
  onSelect(commitIds: string[]): void;
}

export function CommitSelector(props: CommitSelectorProps) {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const context = commitContext(props.data);
  const grouped = hasGroupedCommitView(props.data);
  const rowOffset = grouped ? 1 : 0;
  const selectionPosition = rowOffset + props.data.commits.length;
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(props.data.selectedCommitIds));
  const [activePosition, setActivePosition] = useState(rowOffset);

  useEffect(() => {
    if (!props.open) return;
    setChecked(new Set(props.data.selectedCommitIds));
    const selectedIndex = props.data.selectedCommitIds.length === 1
      ? props.data.commits.findIndex((commit) => commit.id === props.data.selectedCommitIds[0])
      : -1;
    setActivePosition(rowOffset + Math.max(0, selectedIndex));
    dialog.current?.focus();
  }, [props.open, props.data.selectedCommitIds, rowOffset]);

  useLayoutEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const previous = matchesShortcut(event, "previousFile");
      const next = matchesShortcut(event, "nextFile");
      const target = event.target instanceof HTMLElement ? event.target : null;
      const actionControl = target?.closest("button, input, a");
      const show = !actionControl && matchesShortcut(event, "showHighlightedCommit");
      const toggleActive = !actionControl && matchesShortcut(event, "toggleHighlightedCommit");
      if (!previous && !next && !show && !toggleActive) return;
      event.preventDefault();
      event.stopPropagation();
      if (previous || next) {
        setActivePosition((current) => {
          const count = selectionPosition + 1;
          return count === 0 ? 0 : (current + (previous ? -1 : 1) + count) % count;
        });
        dialog.current?.focus();
        return;
      }
      if (grouped && activePosition === 0) {
        apply([]);
        return;
      }
      if (activePosition === selectionPosition) {
        if (checked.size > 0) apply(selectedCommitIds(props.data.commits, checked));
        return;
      }
      const commit = props.data.commits[activePosition - rowOffset];
      if (!commit) return;
      show ? apply([commit.id]) : toggle(commit.id);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [activePosition, checked, grouped, props.open, props.data.commits, rowOffset, selectionPosition]);

  useEffect(() => {
    if (!props.open) return;
    if (activePosition < rowOffset || activePosition >= selectionPosition) return;
    const target = root.current?.querySelector<HTMLElement>(`[data-commit-position="${activePosition}"]`);
    target?.scrollIntoView?.({ block: "nearest" });
  }, [activePosition, props.open, rowOffset, selectionPosition]);

  useEffect(() => {
    if (!props.open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) props.onOpenChange(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [props.open, props.onOpenChange]);

  const newer = commitNavigationTarget(props.data, "newer");
  const older = commitNavigationTarget(props.data, "older");
  const navigationDisabled = props.disabled || props.loading;

  const toggle = (id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const apply = (ids: string[]) => {
    props.onOpenChange(false);
    props.onSelect(ids);
  };

  return (
    <div ref={root} class={`${styles.root} ${props.nativeHeader ? styles.nativeRoot : ""}`}>
      {props.nativeHeader ? null : <div class={styles.navigation}>
        <button
          type="button"
          class={styles.step}
          disabled={navigationDisabled || !newer}
          aria-label={newer ? navigationLabel(newer.commit, "newer") : "No newer commit"}
          title={newer ? navigationTitle(newer.commit, "newer") : "No newer commit"}
          onClick={() => newer && apply(newer.selectedCommitIds)}
        ><Icon name="arrow-left" /></button>
        <button
          class={styles.trigger}
          aria-expanded={props.open}
          aria-haspopup="dialog"
          disabled={props.disabled}
          title={props.disabled ? "Finish or delete draft comments before changing commits" : "Choose commits to review"}
          onClick={() => props.onOpenChange(!props.open)}
        >
          <span class={styles.triggerText}>
            {context ? <CommitIdentity context={context} /> : (
              <>
                <strong>No commits to review</strong>
              <span>{props.data.comparison.baseRef}…HEAD</span>
              </>
            )}
          </span>
          <span class={styles.caret} aria-hidden="true">▾</span>
        </button>
        <button
          type="button"
          class={styles.step}
          disabled={navigationDisabled || !older}
          aria-label={older ? props.data.selectedCommitIds.length === 0
            ? `Show latest commit ${older.commit?.summary}`
            : navigationLabel(older.commit, "older") : "No older commit"}
          title={older ? props.data.selectedCommitIds.length === 0
            ? `Latest: ${older.commit?.summary}`
            : navigationTitle(older.commit, "older") : "No older commit"}
          onClick={() => older && apply(older.selectedCommitIds)}
        ><Icon name="arrow-right" /></button>
      </div>}
      {props.open ? (
        <section ref={dialog} class={styles.popover} role="dialog" aria-label="Choose commits" tabIndex={-1}>
          <header class={styles.header}>
            <span>
              <strong>Commits to review</strong>
              <small>{props.data.comparison.baseRef}…HEAD</small>
            </span>
            {grouped ? (
              <button
                class={`${styles.secondary} ${activePosition === 0 ? styles.activeAction : ""}`}
                data-commit-position={0}
                data-active={activePosition === 0 ? "true" : undefined}
                disabled={props.loading}
                onMouseEnter={() => setActivePosition(0)}
                onClick={() => apply([])}
              >Show all</button>
            ) : null}
          </header>
          <div class={styles.list}>
            {props.data.commits.map((commit, index) => (
              <CommitRow
                key={commit.id}
                commit={commit}
                index={index}
                position={rowOffset + index}
                active={rowOffset + index === activePosition}
                checked={checked.has(commit.id)}
                disabled={props.loading}
                onActivate={() => setActivePosition(rowOffset + index)}
                onToggle={() => toggle(commit.id)}
                onShow={() => apply([commit.id])}
              />
            ))}
          </div>
          <footer class={styles.footer}>
            <span>{checked.size === 0 ? "Select commits, or show the full branch diff." : `${checked.size} selected`}</span>
            <button
              class={`${styles.primary} ${activePosition === selectionPosition ? styles.activeAction : ""}`}
              data-commit-position={selectionPosition}
              data-active={activePosition === selectionPosition ? "true" : undefined}
              disabled={checked.size === 0 || props.loading}
              onMouseEnter={() => setActivePosition(selectionPosition)}
              onClick={() => apply(selectedCommitIds(props.data.commits, checked))}
            >
              {props.loading ? "Loading…" : `Show (${checked.size})`}
            </button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}

function CommitRow({ commit, index, position, active, checked, disabled, onActivate, onToggle, onShow }: {
  commit: CommitSummary;
  index: number;
  position: number;
  active: boolean;
  checked: boolean;
  disabled: boolean;
  onActivate(): void;
  onToggle(): void;
  onShow(): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const messageBody = fullMessageBody(commit);
  const virtual = commit.id === WORKTREE_COMMIT_ID;
  const context = commitSummaryContext(commit);
  return (
    <div
      class={`${styles.row} ${virtual ? styles.virtualRow : ""} ${active ? styles.activeRow : ""}`}
      data-commit-index={index}
      data-commit-position={position}
      data-active={active ? "true" : undefined}
      onMouseEnter={onActivate}
    >
      <label class={styles.commitLabel}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
        <CommitIdentity context={context} className={styles.commitText} />
      </label>
      {messageBody ? (
        <button
          class={styles.expandMessage}
          aria-label={`${expanded ? "Hide" : "Show"} full message for ${commit.summary}`}
          aria-expanded={expanded}
          title="Full commit message"
          onClick={() => setExpanded(!expanded)}
        >
          <span>Message</span>
          <span class={`${styles.messageChevron} ${expanded ? styles.expanded : ""}`}><Icon name="chevron" size={14} /></span>
        </button>
      ) : null}
      <button class={styles.showOne} disabled={disabled} aria-label={`Show only ${commit.summary}`} onClick={onShow}>Show</button>
      {expanded ? <div class={styles.fullMessage}>{messageBody}</div> : null}
    </div>
  );
}

function selectedCommitIds(commits: CommitSummary[], checked: ReadonlySet<string>): string[] {
  return commits.filter((commit) => checked.has(commit.id)).map((commit) => commit.id);
}

function CommitIdentity({ context, className }: { context: CommitContext; className?: string }) {
  return (
    <span class={`${styles.identity} ${className ?? ""}`}>
      <strong>{context.title}</strong>
      <span><code>{context.ref}</code> by {context.authors}</span>
    </span>
  );
}

function navigationLabel(commit: CommitSummary | null, direction: "newer" | "older"): string {
  return commit ? `Show ${direction} commit ${commit.summary}` : "Show virtual commit";
}

function navigationTitle(commit: CommitSummary | null, direction: "newer" | "older"): string {
  return commit ? `${direction === "newer" ? "Newer" : "Older"}: ${commit.summary}` : "Virtual commit";
}
