import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { fileAtViewportTop } from "../scrollSpy";
import type { DraftComment } from "../state";
import type { DiffHunk as DiffHunkType, DiffLine as DiffLineType, FileDiff } from "../types";
import { CommentEditor } from "./CommentEditor";
import { Icon } from "./Icon";
import styles from "./DiffView.module.css";

interface DiffViewProps {
  viewKey: string;
  files: FileDiff[];
  collapsedFiles: ReadonlySet<string>;
  openLineId: string | null;
  drafts: Readonly<Record<string, DraftComment>>;
  onToggleFile(fileId: string): void;
  onOpenComment(lineId: string): void;
  onCloseComment(): void;
  onSaveComment(comment: DraftComment): void;
  onDeleteComment(lineId: string): void;
  onVisibleFile(fileId: string): void;
}

export function DiffView(props: DiffViewProps) {
  const pane = useRef<HTMLElement>(null);
  const animationFrame = useRef<number | null>(null);
  const scrollPositions = useRef<Map<string, number>>(new Map());
  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);
  useLayoutEffect(() => {
    const element = pane.current;
    if (!element) return;
    element.scrollTop = scrollPositions.current.get(props.viewKey) ?? 0;
  }, [props.viewKey]);

  if (props.files.length === 0) {
    return <main class={styles.empty}><h2>No changed files</h2><p>This commit has no reviewable tree changes.</p></main>;
  }
  const updateVisibleFile = () => {
    const element = pane.current;
    if (element) scrollPositions.current.set(props.viewKey, element.scrollTop);
    if (animationFrame.current !== null) return;
    animationFrame.current = requestAnimationFrame(() => {
      animationFrame.current = null;
      const currentPane = pane.current;
      if (!currentPane) return;
      const positions = Array.from(currentPane.querySelectorAll<HTMLElement>("article[data-file-id]"))
        .map((file) => ({ id: file.dataset.fileId ?? "", top: file.getBoundingClientRect().top }))
        .filter((file) => file.id.length > 0);
      const atScrollEnd = currentPane.scrollTop + currentPane.clientHeight >= currentPane.scrollHeight - 1;
      const fileId = fileAtViewportTop(positions, currentPane.getBoundingClientRect().top, atScrollEnd);
      if (fileId) props.onVisibleFile(fileId);
    });
  };
  return (
    <main ref={pane} class={styles.pane} aria-label="Commit diff" onScroll={updateVisibleFile}>
      {props.files.map((file) => <DiffFileCard key={file.id} file={file} {...props} />)}
    </main>
  );
}

function DiffFileCard({ file, ...props }: DiffViewProps & { file: FileDiff }) {
  const collapsed = props.collapsedFiles.has(file.id);
  return (
    <article class={styles.file} id={`file-${file.id}`} data-file-id={file.id}>
      <header class={styles.fileHeader}>
        <button class={styles.collapseButton} aria-expanded={!collapsed} onClick={() => props.onToggleFile(file.id)}>
          <span class={`${styles.chevron} ${collapsed ? styles.collapsed : ""}`}><Icon name="chevron" /></span>
          <span class={styles.path}>{file.displayPath}</span>
          {file.oldPath && file.newPath && file.oldPath !== file.newPath ? <span class={styles.renamedFrom}>from {file.oldPath}</span> : null}
          {file.sourceCommit ? (
            <span class={styles.sourceCommit} title={`${file.sourceCommit.shortId} · ${file.sourceCommit.summary}`}>
              <code>{file.sourceCommit.shortId}</code>
              <span>{file.sourceCommit.summary}</span>
            </span>
          ) : null}
        </button>
        <div class={styles.stats} aria-label={`${file.additions} additions and ${file.deletions} deletions`}>
          <strong class={styles.additions}>+{file.additions}</strong>
          <strong class={styles.deletions}>−{file.deletions}</strong>
        </div>
      </header>
      {!collapsed ? (
        <div>
          {file.binary ? <Placeholder title="Binary file changed" detail="Binary contents cannot be reviewed line by line." /> : null}
          {!file.binary && file.hunks.length === 0 ? <Placeholder title="File metadata changed" detail={`${file.oldMode} → ${file.newMode}`} /> : null}
          {!file.binary && file.hunks.map((hunk) => <DiffHunk key={hunk.id} file={file} hunk={hunk} {...props} />)}
        </div>
      ) : null}
    </article>
  );
}

function Placeholder({ title, detail }: { title: string; detail: string }) {
  return <div class={styles.placeholder}><strong>{title}</strong><span>{detail}</span></div>;
}

function DiffHunk({ file, hunk, ...props }: DiffViewProps & { file: FileDiff; hunk: DiffHunkType }) {
  return (
    <section class={styles.hunk} aria-label={hunk.header}>
      <div class={styles.hunkHeader}><span /><span /><span /><span>{hunk.header}</span></div>
      {hunk.lines.map((line) => <DiffRow key={line.id} file={file} line={line} {...props} />)}
    </section>
  );
}

function DiffRow({ file, line, ...props }: DiffViewProps & { file: FileDiff; line: DiffLineType }) {
  const draft = props.drafts[line.id];
  const editorOpen = props.openLineId === line.id;
  const lineNumber = line.kind === "deletion" ? line.oldLine : line.newLine;
  const lineLabel = `${line.kind === "deletion" ? "L" : "R"}${lineNumber ?? "?"}`;
  return (
    <div class={styles.rowGroup}>
      <div class={`${styles.line} ${styles[line.kind]}`} data-line-id={line.id}>
        <button
          class={styles.addComment}
          aria-label={`Add comment on ${file.displayPath} ${lineLabel}`}
          disabled={line.kind === "marker"}
          onClick={() => props.onOpenComment(line.id)}
        >+
        </button>
        <span class={styles.oldNumber}>{line.oldLine ?? ""}</span>
        <span class={styles.newNumber}>{line.newLine ?? ""}</span>
        <span class={styles.marker}>{marker(line.kind)}</span>
        <code class={styles.code}>{line.text}{line.lossy ? <span class={styles.lossy} title="This line contained invalid UTF-8"> �</span> : null}</code>
      </div>
      {editorOpen ? (
        <div class={styles.commentRow}>
          <CommentEditor
            lineLabel={lineLabel}
            initialBody={draft?.body ?? ""}
            onCancel={props.onCloseComment}
            onSave={(body) => props.onSaveComment({ fileId: file.id, lineId: line.id, body })}
          />
        </div>
      ) : draft ? (
        <div class={styles.commentRow}>
          <div class={styles.draft}>
            <div class={styles.draftHeader}><strong>Draft comment on {lineLabel}</strong><span>Not shared yet</span></div>
            <p>{draft.body}</p>
            <div class={styles.draftActions}>
              <button onClick={() => props.onOpenComment(line.id)}>Edit</button>
              <button onClick={() => props.onDeleteComment(line.id)}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function marker(kind: DiffLineType["kind"]): string {
  return { addition: "+", deletion: "−", context: "", marker: "\\" }[kind];
}
