import type { CommitSummary } from "./types";

export function consecutiveCommitIds(commits: readonly CommitSummary[], ids: readonly string[]): string[] {
  if (ids.length < 2) return [...ids];
  const remaining = new Set(ids);
  const catalog = new Map(commits.map((commit) => [commit.id, commit]));
  const newest = commits.find((commit) => remaining.has(commit.id));
  const result: string[] = [];
  let commit = newest;
  while (commit) {
    result.push(commit.id);
    remaining.delete(commit.id);
    if (remaining.size === 0) return result;
    commit = commit.parentId === null ? undefined : catalog.get(commit.parentId);
  }
  throw new Error("Select a consecutive range on one first-parent history");
}

export function toggleCommitRange(commits: readonly CommitSummary[], ids: readonly string[], id: string): string[] {
  const range = consecutiveCommitIds(commits, ids);
  return consecutiveCommitIds(commits, toggleRangeEndpoint(range, id));
}

export function toggleRangeEndpoint(range: readonly string[], id: string): string[] {
  const index = range.indexOf(id);
  if (index === -1) return [...range, id];
  return index === 0 ? range.slice(1) : range.slice(0, index);
}
