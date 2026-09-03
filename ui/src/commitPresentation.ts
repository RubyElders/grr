import type { CommitSummary, ReviewData } from "./types";

export function displayedCommits(data: ReviewData): CommitSummary[] {
  return data.selectedCommitIds.length === 0
    ? data.commits
    : data.commits.filter((commit) => data.selectedCommitIds.includes(commit.id));
}

export function focusedCommit(data: ReviewData): CommitSummary | null {
  if (data.selectedCommitIds.length > 1) return null;
  if (data.selectedCommitIds.length === 1) {
    return data.commits.find((commit) => commit.id === data.selectedCommitIds[0]) ?? null;
  }
  return data.commits.find((commit) => commit.id === data.commit.id) ?? null;
}

export function hasGroupedCommitView(data: ReviewData): boolean {
  return data.commits.length > 1;
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
