import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { commitContext } from "../commitPresentation";
import type { ReviewData } from "../types";
import { Icon } from "./Icon";
import styles from "./CommitMessagePanel.module.css";

export function CommitMessagePanel({ data }: { data: ReviewData }) {
  const context = commitContext(data);
  const message = context?.message ?? "";
  const text = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useLayoutEffect(() => {
    setExpanded(false);
  }, [context?.id]);

  useLayoutEffect(() => {
    if (!context || expanded) return;
    const update = () => setCanExpand(message.includes("\n") || (text.current?.scrollWidth ?? 0) > (text.current?.clientWidth ?? 0));
    update();
    if (typeof ResizeObserver === "undefined" || !text.current) return;
    const observer = new ResizeObserver(update);
    observer.observe(text.current);
    return () => observer.disconnect();
  }, [context?.id, expanded, message]);

  if (!context) return null;
  const content = message || "No additional commit message.";
  return (
    <section class={`${styles.panel} ${expanded ? styles.expanded : ""}`} aria-label="Commit message">
      <code>{context.ref}</code>
      <button
        type="button"
        class={styles.message}
        disabled={!canExpand}
        aria-expanded={canExpand ? expanded : undefined}
        aria-label={canExpand ? `${expanded ? "Collapse" : "Expand"} commit message` : undefined}
        onClick={() => canExpand && setExpanded(!expanded)}
      >
        <span ref={text}>{content}</span>
        {canExpand ? <span class={`${styles.chevron} ${expanded ? styles.open : ""}`}><Icon name="chevron" size={14} /></span> : null}
      </button>
    </section>
  );
}
