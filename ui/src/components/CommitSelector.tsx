import { useEffect, useRef, useState } from "preact/hooks";
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

  const selected = props.data.selectedCommitIds;
  const displayedCommits = selected.length === 0
    ? props.data.commits
    : props.data.commits.filter((commit) => selected.includes(commit.id));
  const singleCommit = displayedCommits.length === 1 ? displayedCommits[0] : null;
  const title = singleCommit
    ? singleCommit.summary
    : selected.length > 0
      ? `${displayedCommits.length} selected commits`
      : props.data.commit.summary;
  const detail = singleCommit
    ? `${singleCommit.shortId} by ${singleCommit.author}`
    : selected.length === 0
      ? `${displayedCommits.length} ${plural(displayedCommits.length, "commit")} · ${props.data.comparison.baseRef}…HEAD`
      : `${props.data.commits.length} commits available · ${props.data.comparison.baseRef}…HEAD`;

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
      <button
        class={styles.trigger}
        aria-expanded={props.open}
        aria-haspopup="dialog"
        disabled={props.disabled}
        title={props.disabled ? "Finish or delete draft comments before changing commits" : "Choose commits to review"}
        onClick={() => props.onOpenChange(!props.open)}
      >
        <span class={styles.triggerText}>
          <strong>{title}</strong>
          <span>{detail}</span>
        </span>
        <span class={styles.caret} aria-hidden="true">▾</span>
      </button>
      {props.open ? (
        <section class={styles.popover} role="dialog" aria-label="Choose commits">
          <header class={styles.header}>
            <span>
              <strong>Commits to review</strong>
              <small>{props.data.comparison.baseRef}…HEAD</small>
            </span>
            <button class={styles.secondary} disabled={props.loading} onClick={() => apply([])}>Show all</button>
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
  return (
    <div class={`${styles.row} ${virtual ? styles.virtualRow : ""}`}>
      <label class={styles.commitLabel}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
        <span class={styles.commitText}>
          <strong>{commit.summary}</strong>
          <span><code>{commit.shortId}</code> by {commit.author}{virtual ? <em class={styles.virtualBadge}>Virtual</em> : null}</span>
        </span>
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

export function fullMessageBody(commit: CommitSummary): string {
  const firstNewline = commit.message.indexOf("\n");
  return firstNewline === -1 ? "" : commit.message.slice(firstNewline + 1).trim();
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
