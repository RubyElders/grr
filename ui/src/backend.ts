import { invoke } from "@tauri-apps/api/core";
import type { ReviewData, SubmittedReview } from "./types";

export interface ReviewBackend {
  getReview(): Promise<ReviewData>;
  selectCommits(commitIds: string[]): Promise<ReviewData>;
  finishReview(review: SubmittedReview): Promise<void>;
  cancelReview(): Promise<void>;
}

export const tauriBackend: ReviewBackend = {
  getReview: () => invoke<ReviewData>("get_review"),
  selectCommits: (commitIds) => invoke<ReviewData>("select_commits", { commitIds }),
  finishReview: (review) => invoke<void>("finish_review", { review }),
  cancelReview: () => invoke<void>("cancel_review"),
};
