import { useEffect, useRef, useState } from "preact/hooks";
import { commitContext, commitNavigationTarget, commitSummaryContext, fullMessageBody, hasGroupedCommitView, type CommitContext } from "../commitPresentation";
import { WORKTREE_COMMIT_ID, type CommitSummary, type ReviewData } from "../types";
import { Icon } from "./Icon";
import styles from "./CommitSelector.module.css";

interface CommitSelectorProps {
  data: ReviewData;
  open: boolean;
  loading: boolean;
  disabled: boolean;
  onOpenChange(open: boolean): void;
  onSelect(commitIds: string[]): void;
}

export function CommitSelector(props: CommitSelectorProps) {
  const root = useRef<HTMLDivElement>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(props.data.selectedCommitIds));

  useEffect(() => {
    if (props.open) setChecked(new Set(props.data.selectedCommitIds));
  }, [props.open, props.data.selectedCommitIds]);

  useEffect(() => {
    if (!props.open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) props.onOpenChange(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [props.open, props.onOpenChange]);

  const context = commitContext(props.data);
  const grouped = hasGroupedCommitView(props.data);
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
    <div ref={root} class={styles.root}>
      <div class={styles.navigation}>
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
      </div>
      {props.open ? (
        <section class={styles.popover} role="dialog" aria-label="Choose commits">
          <header class={styles.header}>
            <span>
              <strong>Commits to review</strong>
              <small>{props.data.comparison.baseRef}…HEAD</small>
            </span>
            {grouped ? <button class={styles.secondary} disabled={props.loading} onClick={() => apply([])}>Show all</button> : null}
          </header>
          <div class={styles.list}>
            {props.data.commits.map((commit) => (
              <CommitRow
                key={commit.id}
                commit={commit}
                checked={checked.has(commit.id)}
                disabled={props.loading}
                onToggle={() => toggle(commit.id)}
                onShow={() => apply([commit.id])}
              />
            ))}
          </div>
          <footer class={styles.footer}>
            <span>{checked.size === 0 ? "Select commits, or show the full branch diff." : `${checked.size} selected`}</span>
            <button
              class={styles.primary}
              disabled={checked.size === 0 || props.loading}
              onClick={() => apply(props.data.commits.filter((commit) => checked.has(commit.id)).map((commit) => commit.id))}
            >
              {props.loading ? "Loading…" : `Show (${checked.size})`}
            </button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}

function CommitRow({ commit, checked, disabled, onToggle, onShow }: {
  commit: CommitSummary;
  checked: boolean;
  disabled: boolean;
  onToggle(): void;
  onShow(): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const messageBody = fullMessageBody(commit);
  const virtual = commit.id === WORKTREE_COMMIT_ID;
  const context = commitSummaryContext(commit);
  return (
    <div class={`${styles.row} ${virtual ? styles.virtualRow : ""}`}>
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

function CommitIdentity({ context, className }: { context: CommitContext; className?: string }) {
  return (
    <span class={`${styles.identity} ${className ?? ""}`}>
      <strong>{context.title}</strong>
      <span><code>{context.ref}</code> by {context.authors}</span>
    </span>
  );
}

function navigationLabel(commit: CommitSummary | null, direction: "newer" | "older"): string {
  return commit ? `Show ${direction} commit ${commit.summary}` : "Show full commit range";
}

function navigationTitle(commit: CommitSummary | null, direction: "newer" | "older"): string {
  return commit ? `${direction === "newer" ? "Newer" : "Older"}: ${commit.summary}` : "Full commit range";
}
