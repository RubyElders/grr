import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { commitContext, displayedCommits } from "../commitPresentation";
import { shortcutTitle } from "../shortcuts";
import { WORKTREE_COMMIT_ID, type ReviewData } from "../types";
import { Icon } from "./Icon";
import styles from "./CommitMessagePanel.module.css";

export function CommitMessagePanel({ data }: { data: ReviewData }) {
  const context = commitContext(data);
  const message = context?.message ?? "";
  const commits = displayedCommits(data);
  const single = commits.length === 1 ? commits[0]! : null;
  const committed = single !== null && single.id !== WORKTREE_COMMIT_ID;
  const text = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useLayoutEffect(() => {
    setExpanded(false);
  }, [context?.id]);

  useLayoutEffect(() => {
    if (!context || expanded) return;
    const update = () => setCanExpand(committed || message.includes("\n") || (text.current?.scrollWidth ?? 0) > (text.current?.clientWidth ?? 0));
    update();
    if (typeof ResizeObserver === "undefined" || !text.current) return;
    const observer = new ResizeObserver(update);
    observer.observe(text.current);
    return () => observer.disconnect();
  }, [context?.id, expanded, message, committed]);

  if (!context) return null;
  const content = message || "No additional commit message.";
  return (
    <section
      class={`${styles.panel} ${expanded ? styles.expanded : ""}`}
      aria-label="Commit message"
      data-commit-title={context.title}
      data-commit-ref={context.ref}
    >
      <button
        type="button"
        class={styles.message}
        disabled={!canExpand}
        title={canExpand ? shortcutTitle("historyMessage") : undefined}
        aria-expanded={canExpand ? expanded : undefined}
        aria-label={canExpand ? `${expanded ? "Collapse" : "Expand"} commit message` : undefined}
        onClick={() => canExpand && setExpanded(!expanded)}
      >
        <span ref={text}>{expanded ? context.title : content}</span>
        {canExpand ? <span class={`${styles.chevron} ${expanded ? styles.open : ""}`}><Icon name="chevron" size={14} /></span> : null}
      </button>
      {expanded ? <div class={styles.details}>
        <dl class={styles.metadata}>
          <div><dt>Author</dt><dd>{single ? single.author : context.authors}{single?.authorEmail ? ` <${single.authorEmail}>` : ""}</dd></div>
          {committed ? <>
            <div><dt>Commit</dt><dd><code>{single.id}</code></dd></div>
            <div><dt>Date</dt><dd><time dateTime={new Date(single.authoredAt * 1000).toISOString()}>{new Date(single.authoredAt * 1000).toLocaleString()}</time></dd></div>
          </> : null}
        </dl>
        <p class={styles.body}>{content}</p>
      </div> : null}
    </section>
  );
}
