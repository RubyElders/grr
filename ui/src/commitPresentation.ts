import type { CommitSummary, ReviewData } from "./types";

export function displayedCommits(data: ReviewData): CommitSummary[] {
  return data.selectedCommitIds.length === 0
    ? data.commits
    : data.commits.filter((commit) => data.selectedCommitIds.includes(commit.id));
}

export interface CommitContext {
  id: string;
  ref: string;
  title: string;
  authors: string;
  message: string;
}

export function commitContext(data: ReviewData): CommitContext | null {
  const commits = displayedCommits(data);
  if (commits.length === 0) return null;
  if (commits.length === 1) return commitSummaryContext(commits[0]!);
  return {
    id: `range:${commits.map((commit) => commit.id).join(",")}`,
    ref: "range",
    title: data.selectedCommitIds.length === 0
      ? `${commits.length} commits against ${data.comparison.baseRef}`
      : `${commits.length} selected commits`,
    authors: summarizeCommitAuthors(commits),
    message: "Virtual commit range.",
  };
}

export function commitSummaryContext(commit: CommitSummary): CommitContext {
  return {
    id: commit.id,
    ref: commit.shortId,
    title: commit.summary,
    authors: commit.author,
    message: fullMessageBody(commit),
  };
}

export function hasGroupedCommitView(data: ReviewData): boolean {
  return data.commits.length > 1;
}

export function summarizeCommitAuthors(commits: CommitSummary[]): string {
  const counts = new Map<string, number>();
  for (const commit of commits) counts.set(commit.author, (counts.get(commit.author) ?? 0) + 1);
  return Array.from(counts, ([author, count]) => `${author} (${count})`).join(", ");
}

export interface CommitNavigationTarget {
  commit: CommitSummary | null;
  selectedCommitIds: string[];
}

export function commitNavigationTarget(
  data: ReviewData,
  direction: "newer" | "older",
): CommitNavigationTarget | null {
  if (data.selectedCommitIds.length > 1) return null;
  if (data.selectedCommitIds.length === 0) {
    if (!hasGroupedCommitView(data)) return null;
    const latest = data.commits[0];
    return direction === "older" && latest
      ? { commit: latest, selectedCommitIds: [latest.id] }
      : null;
  }

  const index = data.commits.findIndex((commit) => commit.id === data.selectedCommitIds[0]);
  if (index < 0) return null;
  if (direction === "newer" && index === 0 && hasGroupedCommitView(data)) {
    return { commit: null, selectedCommitIds: [] };
  }
  const commit = data.commits[index + (direction === "newer" ? -1 : 1)];
  return commit ? { commit, selectedCommitIds: [commit.id] } : null;
}

export function fullMessageBody(commit: CommitSummary): string {
  const firstNewline = commit.message.indexOf("\n");
  return firstNewline === -1 ? "" : commit.message.slice(firstNewline + 1).trim();
}
