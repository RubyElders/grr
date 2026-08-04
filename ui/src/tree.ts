import type { FileDiff } from "./types";

export interface FileTreeNode {
  name: string;
  path: string;
  directories: FileTreeNode[];
  files: FileDiff[];
}

export function buildFileTree(files: FileDiff[]): FileTreeNode {
  const root: FileTreeNode = { name: "", path: "", directories: [], files: [] };
  for (const file of files) {
    const parts = file.displayPath.split("/");
    parts.pop();
    let node = root;
    for (const part of parts) {
      const path = node.path ? `${node.path}/${part}` : part;
      let child = node.directories.find((directory) => directory.name === part);
      if (!child) {
        child = { name: part, path, directories: [], files: [] };
        node.directories.push(child);
      }
      node = child;
    }
    node.files.push(file);
  }
  sortTree(root);
  return root;
}

function sortTree(node: FileTreeNode): void {
  node.directories.sort((left, right) => left.name.localeCompare(right.name));
  node.files.sort((left, right) => left.displayPath.localeCompare(right.displayPath));
  node.directories.forEach(sortTree);
}

export function filteredFiles(files: FileDiff[], filter: string): FileDiff[] {
  const query = filter.trim().toLocaleLowerCase();
  return query
    ? files.filter((file) => file.displayPath.toLocaleLowerCase().includes(query))
    : files;
}

export function baseName(path: string): string {
  return path.split("/").at(-1) ?? path;
}
