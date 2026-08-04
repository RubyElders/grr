import { useEffect, useRef, useState } from "preact/hooks";
import styles from "./CommentEditor.module.css";

interface CommentEditorProps {
  lineLabel: string;
  initialBody: string;
  onSave(body: string): void;
  onCancel(): void;
}

export function CommentEditor({ lineLabel, initialBody, onSave, onCancel }: CommentEditorProps) {
  const [body, setBody] = useState(initialBody);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => textarea.current?.focus(), []);
  const valid = body.trim().length > 0 && body.length <= 10_000;
  return (
    <div class={styles.editor} role="group" aria-label={`Comment on ${lineLabel}`}>
      <div class={styles.heading}>Add a comment on {lineLabel}</div>
      <textarea
        ref={textarea}
        aria-label="Review comment"
        placeholder="Leave a comment"
        value={body}
        maxLength={10_000}
        onInput={(event) => setBody(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (valid) onSave(body.trim());
          }
        }}
      />
      <div class={styles.footer}>
        <span>{body.length.toLocaleString()} / 10,000</span>
        <button type="button" class={styles.cancel} onClick={onCancel}>Cancel</button>
        <button type="button" class={styles.save} disabled={!valid} onClick={() => onSave(body.trim())}>Save comment</button>
      </div>
    </div>
  );
}
