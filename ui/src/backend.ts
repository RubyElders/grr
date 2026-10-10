import { invoke } from "@tauri-apps/api/core";
import type { FileDiff, HistoryPage, ReviewData, SubmittedReview } from "./types";

export interface ReviewBackend {
  getReview(): Promise<ReviewData>;
  selectCommits(commitIds: string[]): Promise<ReviewData>;
  getHistory(offset: number, limit: number): Promise<HistoryPage>;
  getHistoryFiles(commitIds: string[]): Promise<FileDiff[]>;
  finishReview(review: SubmittedReview, copyToClipboard?: boolean): Promise<void>;
  cancelReview(): Promise<void>;
}

export const tauriBackend: ReviewBackend = {
  getReview: () => invoke<ReviewData>("get_review"),
  selectCommits: (commitIds) => invoke<ReviewData>("select_commits", { commitIds }),
  getHistory: (offset, limit) => invoke<HistoryPage>("get_history", { offset, limit }),
  getHistoryFiles: (commitIds) => invoke<FileDiff[]>("get_history_files", { commitIds }),
  finishReview: (review, copyToClipboard = false) => invoke<void>("finish_review", { review, copyToClipboard }),
  cancelReview: () => invoke<void>("cancel_review"),
};
