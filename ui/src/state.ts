import type { ReviewComment, ReviewData, SubmittedReview } from "./types";

export interface DraftComment extends ReviewComment {}

export interface ReviewState {
  data: ReviewData | null;
  phase: "loading" | "ready" | "selecting" | "submitting" | "error";
  error: string | null;
  filter: string;
  collapsedDirectories: ReadonlySet<string>;
  collapsedFiles: ReadonlySet<string>;
  activeFileId: string | null;
  openLineId: string | null;
  drafts: Readonly<Record<string, DraftComment>>;
}

export const initialState: ReviewState = {
  data: null,
  phase: "loading",
  error: null,
  filter: "",
  collapsedDirectories: new Set(),
  collapsedFiles: new Set(),
  activeFileId: null,
  openLineId: null,
  drafts: {},
};

export type ReviewAction =
  | { type: "loaded"; data: ReviewData }
  | { type: "failed"; error: string }
  | { type: "selection-started" }
  | { type: "selection-loaded"; data: ReviewData }
  | { type: "filter"; value: string }
  | { type: "toggle-directory"; path: string }
  | { type: "toggle-file"; fileId: string }
  | { type: "activate-file"; fileId: string }
  | { type: "open-comment"; lineId: string }
  | { type: "close-comment" }
  | { type: "save-comment"; comment: DraftComment }
  | { type: "delete-comment"; lineId: string }
  | { type: "submitting" }
  | { type: "submit-failed"; error: string };

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "loaded":
      return {
        ...state,
        data: action.data,
        phase: "ready",
        error: null,
        activeFileId: action.data.files[0]?.id ?? null,
      };
    case "failed":
      return { ...state, phase: "error", error: action.error };
    case "selection-started":
      return { ...state, phase: "selecting", error: null, openLineId: null };
    case "selection-loaded":
      return {
        ...state,
        data: action.data,
        phase: "ready",
        error: null,
        activeFileId: action.data.files[0]?.id ?? null,
        collapsedFiles: new Set(),
        drafts: {},
        openLineId: null,
      };
    case "filter":
      return { ...state, filter: action.value };
    case "toggle-directory":
      return {
        ...state,
        collapsedDirectories: toggled(state.collapsedDirectories, action.path),
      };
    case "toggle-file":
      return {
        ...state,
        collapsedFiles: toggled(state.collapsedFiles, action.fileId),
      };
    case "activate-file": {
      const collapsedDirectories = new Set(state.collapsedDirectories);
      const path = state.data?.files.find((file) => file.id === action.fileId)?.displayPath;
      const parts = path?.split("/") ?? [];
      parts.pop();
      for (let index = 1; index <= parts.length; index += 1) {
        collapsedDirectories.delete(parts.slice(0, index).join("/"));
      }
      if (state.activeFileId === action.fileId && collapsedDirectories.size === state.collapsedDirectories.size) {
        return state;
      }
      return { ...state, activeFileId: action.fileId, collapsedDirectories };
    }
    case "open-comment":
      return { ...state, openLineId: action.lineId };
    case "close-comment":
      return { ...state, openLineId: null };
    case "save-comment":
      return {
        ...state,
        openLineId: null,
        drafts: { ...state.drafts, [action.comment.lineId]: action.comment },
      };
    case "delete-comment": {
      const drafts = { ...state.drafts };
      delete drafts[action.lineId];
      return {
        ...state,
        drafts,
        openLineId: state.openLineId === action.lineId ? null : state.openLineId,
      };
    }
    case "submitting":
      return { ...state, phase: "submitting", error: null };
    case "submit-failed":
      return { ...state, phase: "ready", error: action.error };
  }
}

function toggled(values: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function orderedComments(state: ReviewState): ReviewComment[] {
  if (!state.data) return [];
  const comments: ReviewComment[] = [];
  for (const file of state.data.files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        const comment = state.drafts[line.id];
        if (comment) comments.push(comment);
      }
    }
  }
  return comments;
}

export function submissionFor(state: ReviewState, outcome: "approve" | "share"): SubmittedReview {
  return { outcome, comments: outcome === "share" ? orderedComments(state) : [] };
}
