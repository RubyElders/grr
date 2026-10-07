import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { CodeMatch } from "../codeSearch";
import { fileIndexAtViewportTop } from "../scrollSpy";
import type { DraftComment } from "../state";
import type { DiffHunk as DiffHunkType, DiffLine as DiffLineType, FileDiff } from "../types";
import { CommentEditor } from "./CommentEditor";
import { Icon } from "./Icon";
import { SyntaxLine } from "./SyntaxLine";
import styles from "./DiffView.module.css";

const MAX_VIRTUAL_CONTENT_HEIGHT = 2048;

interface DiffViewProps {
  viewKey: string;
  files: FileDiff[];
  activeFileId: string | null;
  fileNavigation?: { fileId: string; requestId: number } | null;
  showSourceCommits: boolean;
  collapsedFiles: ReadonlySet<string>;
  openLineId: string | null;
  drafts: Readonly<Record<string, DraftComment>>;
  searchMatches: ReadonlyArray<CodeMatch>;
  activeSearchMatchIndex: number;
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
  const scrollPositions = useRef<Map<string, { top: number; fileId: string | null; offset: number }>>(new Map());
  const contentHeights = useRef<Map<string, number>>(new Map());
  const pendingAnchor = useRef<{ fileId: string; offset: number; scrollTop: number } | null>(null);
  const [nearbyFileIds, setNearbyFileIds] = useState<ReadonlySet<string>>(
    () => new Set(props.files.slice(0, 2).map((file) => file.id)),
  );
  const rememberContentHeight = useCallback((fileId: string, height: number) => {
    contentHeights.current.set(fileId, height);
  }, []);
  const searchMatchesByLine = useMemo(() => {
    const byLine = new Map<string, Array<CodeMatch & { index: number }>>();
    props.searchMatches.forEach((match, index) => {
      const matches = byLine.get(match.lineId) ?? [];
      matches.push({ ...match, index });
      byLine.set(match.lineId, matches);
    });
    return byLine;
  }, [props.searchMatches]);
  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);
  useLayoutEffect(() => {
    const element = pane.current;
    if (!element) return;
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
    pendingAnchor.current = null;
    const saved = scrollPositions.current.get(props.viewKey);
    const card = saved?.fileId ? document.getElementById(`file-${saved.fileId}`) : null;
    element.scrollTop = saved && card && element.contains(card)
      ? element.scrollTop + card.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.offset
      : saved?.top ?? 0;
  }, [props.viewKey]);
  useLayoutEffect(() => {
    if (props.activeSearchMatchIndex < 0) return;
    pane.current?.querySelector<HTMLElement>(`[data-search-match="${props.activeSearchMatchIndex}"]`)
      ?.scrollIntoView?.({ block: "center", inline: "center" });
  }, [props.activeSearchMatchIndex, props.searchMatches]);
  useLayoutEffect(() => {
    const root = pane.current;
    if (!root) return;
    if (!("IntersectionObserver" in window)) {
      setNearbyFileIds(new Set(props.files.map((file) => file.id)));
      return;
    }
    setNearbyFileIds(new Set(props.files.slice(0, 2).map((file) => file.id)));
    const observer = new IntersectionObserver((entries) => {
      if (!pendingAnchor.current) {
        const cards = root.querySelectorAll<HTMLElement>("article[data-file-id]");
        const top = root.getBoundingClientRect().top;
        const index = fileIndexAtViewportTop(cards.length, (index) => cards[index]!.getBoundingClientRect().top, top, false);
        const card = index === null ? null : cards[index];
        if (card?.dataset.fileId) pendingAnchor.current = { fileId: card.dataset.fileId, offset: card.getBoundingClientRect().top - top, scrollTop: root.scrollTop };
      }
      setNearbyFileIds((current) => {
        const next = new Set(current);
        for (const entry of entries) {
          const fileId = (entry.target as HTMLElement).dataset.fileId;
          if (!fileId) continue;
          if (entry.isIntersecting) next.add(fileId);
          else next.delete(fileId);
        }
        return next;
      });
    }, { root, rootMargin: "1000px 0px" });
    root.querySelectorAll("article[data-file-id]").forEach((file) => observer.observe(file));
    return () => observer.disconnect();
  }, [props.files, props.viewKey]);

  const forcedFileIds = useMemo(() => {
    const forced = new Set<string>();
    if (props.activeFileId) forced.add(props.activeFileId);
    if (props.fileNavigation) forced.add(props.fileNavigation.fileId);
    const savedFileId = scrollPositions.current.get(props.viewKey)?.fileId;
    if (savedFileId) forced.add(savedFileId);
    for (const draft of Object.values(props.drafts)) forced.add(draft.fileId);
    const activeMatch = props.searchMatches[props.activeSearchMatchIndex];
    if (activeMatch) forced.add(activeMatch.fileId);
    if (props.openLineId) {
      const openFile = props.files.find((file) => file.hunks.some(
        (hunk) => hunk.lines.some((line) => line.id === props.openLineId),
      ));
      if (openFile) forced.add(openFile.id);
    }
    return forced;
  }, [props.activeFileId, props.fileNavigation, props.activeSearchMatchIndex, props.drafts, props.files, props.openLineId, props.searchMatches, props.viewKey]);

  useLayoutEffect(() => {
    const root = pane.current;
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    if (!root || !anchor) return;
    const card = document.getElementById(`file-${anchor.fileId}`);
    if (!card || !root.contains(card)) return;
    const shift = card.getBoundingClientRect().top - root.getBoundingClientRect().top - anchor.offset
      + root.scrollTop - anchor.scrollTop;
    if (shift !== 0) root.scrollTop += shift;
  }, [nearbyFileIds]);

  useLayoutEffect(() => {
    const root = pane.current;
    const navigation = props.fileNavigation;
    if (!root || !navigation) return;
    const file = document.getElementById(`file-${navigation.fileId}`);
    if (!file || !root.contains(file)) return;
    const top = root.scrollTop + file.getBoundingClientRect().top - root.getBoundingClientRect().top - 12;
    root.scrollTo({ top, behavior: "instant" });
  }, [props.fileNavigation, props.viewKey]);

  if (props.files.length === 0) {
    return <main class={styles.empty}><h2>No changed files</h2><p>This commit has no reviewable tree changes.</p></main>;
  }
  const updateVisibleFile = () => {
    const element = pane.current;
    if (element) {
      const cards = element.querySelectorAll<HTMLElement>("article[data-file-id]");
      const top = element.getBoundingClientRect().top;
      const index = element.clientHeight > 0
        ? fileIndexAtViewportTop(cards.length, (index) => cards[index]!.getBoundingClientRect().top, top, false)
        : null;
      const card = index === null ? null : cards[index];
      scrollPositions.current.set(props.viewKey, {
        top: element.scrollTop,
        fileId: card?.dataset.fileId ?? null,
        offset: card ? card.getBoundingClientRect().top - top : 0,
      });
    }
    if (animationFrame.current !== null) return;
    animationFrame.current = requestAnimationFrame(() => {
      animationFrame.current = null;
      const currentPane = pane.current;
      if (!currentPane) return;
      const files = currentPane.querySelectorAll<HTMLElement>("article[data-file-id]");
      const atScrollEnd = currentPane.scrollTop + currentPane.clientHeight >= currentPane.scrollHeight - 1;
      const fileIndex = fileIndexAtViewportTop(
        files.length,
        (index) => files[index]!.getBoundingClientRect().top,
        currentPane.getBoundingClientRect().top,
        atScrollEnd,
      );
      const fileId = fileIndex === null ? null : files[fileIndex]?.dataset.fileId;
      if (fileId) props.onVisibleFile(fileId);
    });
  };
  return (
    <main ref={pane} class={styles.pane} aria-label="Commit diff" onScroll={updateVisibleFile}>
      {props.files.map((file) => (
        <DiffFileCard
          key={file.id}
          file={file}
          rendered={nearbyFileIds.has(file.id) || forcedFileIds.has(file.id)}
          contentHeight={Math.min(MAX_VIRTUAL_CONTENT_HEIGHT, contentHeights.current.get(file.id) ?? estimatedContentHeight(file))}
          onContentHeight={rememberContentHeight}
          searchMatchesByLine={searchMatchesByLine}
          {...props}
        />
      ))}
    </main>
  );
}

interface DiffContentProps extends DiffViewProps {
  searchMatchesByLine: ReadonlyMap<string, ReadonlyArray<CodeMatch & { index: number }>>;
}

function DiffFileCard({ file, rendered, contentHeight, onContentHeight, ...props }: DiffContentProps & {
  file: FileDiff;
  rendered: boolean;
  contentHeight: number;
  onContentHeight(fileId: string, height: number): void;
}) {
  const collapsed = props.collapsedFiles.has(file.id);
  const sourceCommit = props.showSourceCommits ? file.sourceCommit : null;
  return (
    <article class={styles.file} id={`file-${file.id}`} data-file-id={file.id} data-diff-rendered={rendered ? "true" : "false"}>
      <header class={styles.fileHeader}>
        <button class={styles.collapseButton} aria-expanded={!collapsed} onClick={() => props.onToggleFile(file.id)}>
          <span class={`${styles.chevron} ${collapsed ? styles.collapsed : ""}`}><Icon name="chevron" /></span>
          <span class={styles.path}>{file.displayPath}</span>
          {file.oldPath && file.newPath && file.oldPath !== file.newPath ? <span class={styles.renamedFrom}>from {file.oldPath}</span> : null}
          {sourceCommit ? (
            <span class={styles.sourceCommit} title={`${sourceCommit.shortId} · ${sourceCommit.summary}`}>
              <code>{sourceCommit.shortId}</code>
              <span>{sourceCommit.summary}</span>
            </span>
          ) : null}
        </button>
        <div class={styles.stats} aria-label={`${file.additions} additions and ${file.deletions} deletions`}>
          <strong class={styles.additions}>+{file.additions}</strong>
          <strong class={styles.deletions}>−{file.deletions}</strong>
        </div>
      </header>
      {!collapsed && rendered ? (
        <FileContent file={file} onContentHeight={onContentHeight} {...props} />
      ) : null}
      {!collapsed && !rendered ? <div class={styles.virtualContent} style={{ height: `${contentHeight}px` }} aria-hidden="true" /> : null}
    </article>
  );
}

function FileContent({ file, onContentHeight, ...props }: DiffContentProps & {
  file: FileDiff;
  onContentHeight(fileId: string, height: number): void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const virtualized = file.hunks.reduce((total, hunk) => total + hunk.lines.length, 0) > 256;
  const columns = useMemo(() => {
    if (!virtualized) return null;
    let maximum = 0;
    for (const hunk of file.hunks) for (const line of hunk.lines) {
      let width = 0;
      for (const character of line.text) width += character === "\t" ? 8 - width % 8 : character.length;
      maximum = Math.max(maximum, width);
    }
    return maximum;
  }, [file, virtualized]);
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => {
      const height = element.getBoundingClientRect().height;
      if (height > 0) onContentHeight(file.id, height);
    };
    measure();
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [file.id, onContentHeight]);
  const pathChanged = file.oldPath && file.newPath && file.oldPath !== file.newPath;
  const purePathChange = pathChanged && file.oldOid === file.newOid;
  return (
    <div ref={content} class={styles.fileScroller} aria-label={`Scrollable diff for ${file.displayPath}`}>
      <div class={styles.fileContent}>
        {columns !== null ? <div class={styles.widthGuide} style={{ "--diff-columns": columns }} aria-hidden="true" /> : null}
        {purePathChange ? <Placeholder title={file.status === "copied" ? "File copied" : "File moved"} detail={`${file.oldPath} -> ${file.newPath}`} /> : null}
        {!purePathChange && file.binary ? <Placeholder title="Binary file changed" detail="Binary contents cannot be reviewed line by line." /> : null}
        {!purePathChange && !file.binary && file.hunks.length === 0 ? <Placeholder title="File metadata changed" detail={file.oldMode === file.newMode ? "No line changes to display." : `${file.oldMode} -> ${file.newMode}`} /> : null}
        {!file.binary && file.hunks.map((hunk, index) => <DiffHunk key={hunk.id} file={file} hunk={hunk} virtualized={virtualized} initiallyVisible={index === 0} {...props} />)}
      </div>
    </div>
  );
}

function estimatedContentHeight(file: FileDiff): number {
  if (file.binary || file.hunks.length === 0) return 120;
  return file.hunks.reduce((height, hunk) => height + 32 + hunk.lines.length * 26, 0);
}

function Placeholder({ title, detail }: { title: string; detail: string }) {
  return <div class={styles.placeholder}><strong>{title}</strong><span>{detail}</span></div>;
}

function DiffHunk({ file, hunk, virtualized, initiallyVisible, ...props }: DiffContentProps & { file: FileDiff; hunk: DiffHunkType; virtualized: boolean; initiallyVisible: boolean }) {
  const chunks = useMemo(() => virtualized
    ? Array.from({ length: Math.ceil(hunk.lines.length / 64) }, (_, index) => hunk.lines.slice(index * 64, (index + 1) * 64))
    : null, [hunk.lines, virtualized]);
  return (
    <section class={styles.hunk} aria-label={hunk.header}>
      <div class={styles.hunkHeader}><span /><span /><span /><span>{hunk.header}</span></div>
      {chunks ? chunks.map((lines, index) => <DiffLineChunk key={index} index={index} initiallyVisible={initiallyVisible && index === 0} file={file} lines={lines} {...props} />)
        : hunk.lines.map((line) => <DiffRow key={line.id} file={file} line={line} {...props} />)}
    </section>
  );
}

function DiffLineChunk({ file, lines, index, initiallyVisible, ...props }: DiffContentProps & { file: FileDiff; lines: DiffLineType[]; index: number; initiallyVisible: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(initiallyVisible);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) setVisible(entry.isIntersecting);
    }, { root: node.closest("main"), rootMargin: "600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const matchLine = props.searchMatches[props.activeSearchMatchIndex]?.lineId;
  const forced = lines.some((line) => line.id === props.openLineId || line.id === matchLine || props.drafts[line.id]);
  return <div ref={element} data-line-chunk={index}>
    {visible || forced ? lines.map((line) => <DiffRow key={line.id} file={file} line={line} {...props} />)
      : <div class={styles.virtualContent} style={{ height: `${lines.length * 26}px` }} aria-hidden="true" />}
  </div>;
}

function DiffRow({ file, line, ...props }: DiffContentProps & { file: FileDiff; line: DiffLineType }) {
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
        <code class={styles.code} aria-label={line.text}><SyntaxLine path={file.displayPath} text={line.text} matches={props.searchMatchesByLine.get(line.id)} activeMatchIndex={props.activeSearchMatchIndex} />{line.lossy ? <span class={styles.lossy} title="This line contained invalid UTF-8"> �</span> : null}</code>
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
