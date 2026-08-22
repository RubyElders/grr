import type { FileDiff } from "./types";

export interface CodeMatch {
  fileId: string;
  lineId: string;
  start: number;
  end: number;
}

export function findCodeMatches(files: FileDiff[], query: string): CodeMatch[] {
  if (query.length === 0) return [];
  const needle = query.toLocaleLowerCase();
  const matches: CodeMatch[] = [];
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        const text = line.text.toLocaleLowerCase();
        let start = text.indexOf(needle);
        while (start !== -1) {
          matches.push({ fileId: file.id, lineId: line.id, start, end: start + query.length });
          start = text.indexOf(needle, start + Math.max(1, query.length));
        }
      }
    }
  }
  return matches;
}

export function adjacentMatch(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}
