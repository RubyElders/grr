import { useEffect, useMemo, useRef } from "preact/hooks";
import type { FileDiff } from "../types";
import { baseName, buildFileTree, filteredFiles, type FileTreeNode } from "../tree";
import { Icon } from "./Icon";
import styles from "./FileTree.module.css";

interface FileTreeProps {
  files: FileDiff[];
  filter: string;
  activeFileId: string | null;
  collapsedDirectories: ReadonlySet<string>;
  onFilter(value: string): void;
  onToggleDirectory(path: string): void;
  onSelectFile(fileId: string): void;
}

export function FileTree(props: FileTreeProps) {
  const tree = useRef<HTMLElement>(null);
  const visible = useMemo(() => filteredFiles(props.files, props.filter), [props.files, props.filter]);
  const root = useMemo(() => buildFileTree(visible), [visible]);
  useEffect(() => {
    if (!props.activeFileId) return;
    const active = tree.current?.querySelector<HTMLElement>(`[data-file-id="${props.activeFileId}"]`);
    active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [props.activeFileId]);
  return (
    <aside class={styles.sidebar} aria-label="Changed files">
      <div class={styles.searchBox}>
        <Icon name="search" />
        <input
          aria-label="Filter files"
          type="search"
          placeholder="Filter files…"
          value={props.filter}
          onInput={(event) => props.onFilter(event.currentTarget.value)}
        />
      </div>
      <div class={styles.count}>{visible.length} of {props.files.length} files</div>
      <nav ref={tree} class={styles.tree} aria-label="File tree">
        {visible.length === 0 ? <p class={styles.empty}>No matching files</p> : null}
        {root.directories.map((node) => <DirectoryNode key={node.path} node={node} depth={0} {...props} />)}
        {root.files.map((file) => <FileNode key={file.id} file={file} depth={0} {...props} />)}
      </nav>
    </aside>
  );
}

interface NodeProps extends FileTreeProps {
  depth: number;
}

function DirectoryNode({ node, depth, ...props }: NodeProps & { node: FileTreeNode }) {
  const collapsed = props.filter ? false : props.collapsedDirectories.has(node.path);
  return (
    <div>
      <button
        class={styles.node}
        style={{ "--depth": depth } as preact.JSX.CSSProperties}
        aria-expanded={!collapsed}
        onClick={() => props.onToggleDirectory(node.path)}
      >
        <span class={`${styles.chevron} ${collapsed ? styles.collapsed : ""}`}><Icon name="chevron" size={14} /></span>
        <span class={styles.folder}><Icon name="folder" /></span>
        <span class={styles.nodeName}>{node.name}</span>
      </button>
      {!collapsed ? (
        <div>
          {node.directories.map((child) => <DirectoryNode key={child.path} node={child} depth={depth + 1} {...props} />)}
          {node.files.map((file) => <FileNode key={file.id} file={file} depth={depth + 1} {...props} />)}
        </div>
      ) : null}
    </div>
  );
}

function FileNode({ file, depth, activeFileId, onSelectFile }: NodeProps & { file: FileDiff }) {
  return (
    <button
      class={`${styles.node} ${styles.fileNode}`}
      style={{ "--depth": depth } as preact.JSX.CSSProperties}
      aria-current={activeFileId === file.id ? "true" : undefined}
      onClick={() => onSelectFile(file.id)}
      title={file.displayPath}
      data-file-id={file.id}
    >
      <span class={`${styles.status} ${styles[file.status]}`}>{statusLetter(file.status)}</span>
      <Icon name="file" />
      <span class={styles.nodeName}>{baseName(file.displayPath)}</span>
    </button>
  );
}

function statusLetter(status: FileDiff["status"]): string {
  return { added: "A", deleted: "D", modified: "M", renamed: "R", copied: "C", type_changed: "T", other: "?" }[status];
}
