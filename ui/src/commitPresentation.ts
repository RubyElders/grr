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
  return data.commits.find((commit) => commit.id === data.commit.id) ?? data.commit;
}

export function adjacentCommit(data: ReviewData, direction: "newer" | "older"): CommitSummary | null {
  const current = focusedCommit(data);
  if (!current) return null;
  const index = data.commits.findIndex((commit) => commit.id === current.id);
  if (index < 0) return null;
  return data.commits[index + (direction === "newer" ? -1 : 1)] ?? null;
}

export function fullMessageBody(commit: CommitSummary): string {
  const firstNewline = commit.message.indexOf("\n");
  return firstNewline === -1 ? "" : commit.message.slice(firstNewline + 1).trim();
}
