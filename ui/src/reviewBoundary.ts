import { WORKTREE_COMMIT_ID, type HistoryCommit, type ReviewData } from "./types";

export function reviewBoundary(review: ReviewData, loaded: readonly HistoryCommit[], visible: readonly HistoryCommit[]) {
  const reviewed = new Set(review.commits.map((commit) => commit.id));
  if (reviewed.size === 0) return null;
  const worktreeOnly = reviewed.size === 1 && reviewed.has(WORKTREE_COMMIT_ID);
  if (review.comparison.mergeBaseId === null && !worktreeOnly && review.comparison.baseRef !== "empty tree") return null;
  const label = review.comparison.mergeBaseId === null && worktreeOnly ? "HEAD" : review.comparison.baseRef;
  const loadedIds = new Set(loaded.map((commit) => commit.id));
  const remaining = [...reviewed].filter((id) => !loadedIds.has(id)).length;
  const outside = visible.findIndex((commit) => !reviewed.has(commit.id));
  return { label, remaining, index: remaining > 0 ? null : outside === -1 ? visible.length : outside };
}
