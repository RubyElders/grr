import { useLayoutEffect, useState } from "preact/hooks";
import { shortcutModifiersActive, shortcutTitle } from "../shortcuts";
import styles from "./ReviewActions.module.css";

interface ReviewActionsProps {
  draftCount: number;
  submitting: boolean;
  error: string | null;
  onApprove(copyToClipboard: boolean): void;
  onShare(copyToClipboard: boolean): void;
}

export function ReviewActions({ draftCount, submitting, error, onApprove, onShare }: ReviewActionsProps) {
  const [copyMode, setCopyMode] = useState(false);
  useLayoutEffect(() => {
    const update = (event: KeyboardEvent) => setCopyMode(shortcutModifiersActive(event, "copyPrimaryAction"));
    const reset = () => setCopyMode(false);
    document.addEventListener("keydown", update);
    document.addEventListener("keyup", update);
    window.addEventListener("blur", reset);
    return () => {
      document.removeEventListener("keydown", update);
      document.removeEventListener("keyup", update);
      window.removeEventListener("blur", reset);
    };
  }, []);
  const actionShortcut = shortcutTitle(copyMode ? "copyPrimaryAction" : "primaryAction");
  return (
    <footer class={styles.actions} aria-label="Review actions">
      <div>
        <strong>{draftCount === 0 ? "No draft comments" : `${draftCount} draft comment${draftCount === 1 ? "" : "s"}`}</strong>
        {error ? <span class={styles.error} role="alert">{error}</span> : <span>Results will be printed in the invoking terminal.</span>}
      </div>
      <div class={styles.buttons}>
        <button title={actionShortcut} class={styles.approve} disabled={submitting || draftCount > 0} onClick={() => onApprove(copyMode)}>{copyMode ? "Approve and copy" : "Approve"}</button>
        <button title={actionShortcut} class={styles.share} disabled={submitting || draftCount === 0} onClick={() => onShare(copyMode)}>{copyMode ? "Share and copy" : "Share comments"} ({draftCount})</button>
      </div>
    </footer>
  );
}
