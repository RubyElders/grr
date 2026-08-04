import styles from "./ReviewActions.module.css";

interface ReviewActionsProps {
  draftCount: number;
  submitting: boolean;
  error: string | null;
  onApprove(): void;
  onShare(): void;
}

export function ReviewActions({ draftCount, submitting, error, onApprove, onShare }: ReviewActionsProps) {
  return (
    <footer class={styles.actions}>
      <div>
        <strong>{draftCount === 0 ? "No draft comments" : `${draftCount} draft comment${draftCount === 1 ? "" : "s"}`}</strong>
        {error ? <span class={styles.error} role="alert">{error}</span> : <span>Results will be printed in the invoking terminal.</span>}
      </div>
      <div class={styles.buttons}>
        <button title="Ctrl+Enter" class={styles.approve} disabled={submitting || draftCount > 0} onClick={onApprove}>Approve</button>
        <button title="Ctrl+Enter" class={styles.share} disabled={submitting || draftCount === 0} onClick={onShare}>Share comments ({draftCount})</button>
      </div>
    </footer>
  );
}
