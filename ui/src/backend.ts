import { invoke } from "@tauri-apps/api/core";
import type { ReviewData, SubmittedReview } from "./types";

export interface ReviewBackend {
  getReview(): Promise<ReviewData>;
  finishReview(review: SubmittedReview): Promise<void>;
  cancelReview(): Promise<void>;
}

export const tauriBackend: ReviewBackend = {
  getReview: () => invoke<ReviewData>("get_review"),
  finishReview: (review) => invoke<void>("finish_review", { review }),
  cancelReview: () => invoke<void>("cancel_review"),
};
