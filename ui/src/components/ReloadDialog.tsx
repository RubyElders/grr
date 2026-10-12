import styles from "./ReloadDialog.module.css";

export function ReloadDialog({ count, editing, busy, error, onCancel, onReload }: {
  count: number;
  editing: boolean;
  busy: boolean;
  error: string | null;
  onCancel(): void;
  onReload(): void;
}) {
  return <div class={styles.backdrop}>
    <section class={styles.dialog} role="dialog" aria-modal="true" aria-label="Reload review" tabIndex={busy ? -1 : undefined}>
      <h2>Reload review?</h2>
      <p>{count > 0 ? `Reloading will discard ${count} queued ${count === 1 ? "comment" : "comments"}.` : null}
        {editing ? " The open comment will also be discarded." : null}</p>
      <p>The review will return to the initial Git selection. File filters stay in place.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div class={styles.actions}>
        <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" disabled={busy} onClick={onReload}>{busy ? "Reloading..." : "Discard comments and reload"}</button>
      </div>
    </section>
  </div>;
}
