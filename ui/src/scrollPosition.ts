import type { ReviewData } from "./types";

export function reviewViewKey(data: ReviewData): string {
  if (data.selectedCommitIds.length === 0) {
    const base = data.comparison.mergeBaseId ?? data.comparison.baseId ?? "empty-tree";
    return `all:${base}..${data.comparison.headId}`;
  }
  return `commits:${[...new Set(data.selectedCommitIds)].sort().join(",")}`;
}
