import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/review.json";
import { initialState, orderedComments, reviewReducer, submissionFor } from "./state";
import type { ReviewData } from "./types";

const data = fixture as ReviewData;

describe("review state", () => {
  it("loads data and selects the first file", () => {
    const state = reviewReducer(initialState, { type: "loaded", data });
    expect(state.phase).toBe("ready");
    expect(state.activeFileId).toBe("f0");
  });

  it("toggles sets without mutating previous state", () => {
    const state = reviewReducer(initialState, { type: "toggle-directory", path: "src" });
    expect(state.collapsedDirectories.has("src")).toBe(true);
    expect(initialState.collapsedDirectories.has("src")).toBe(false);
    const reopened = reviewReducer(state, { type: "toggle-directory", path: "src" });
    expect(reopened.collapsedDirectories.has("src")).toBe(false);
  });

  it("orders comments by diff position and creates outcome payloads", () => {
    let state = reviewReducer(initialState, { type: "loaded", data });
    state = reviewReducer(state, { type: "save-comment", comment: { fileId: "f0", lineId: "f0:h0:l3", body: "later" } });
    state = reviewReducer(state, { type: "save-comment", comment: { fileId: "f0", lineId: "f0:h0:l1", body: "earlier" } });
    expect(orderedComments(state).map((comment) => comment.body)).toEqual(["earlier", "later"]);
    expect(submissionFor(state, "approve").comments).toEqual([]);
    expect(submissionFor(state, "share").comments).toHaveLength(2);
    state = reviewReducer(state, { type: "delete-comment", lineId: "f0:h0:l1" });
    expect(orderedComments(state)).toHaveLength(1);
  });

  it("handles navigation, editor, and submission state transitions", () => {
    let state = reviewReducer(initialState, { type: "loaded", data });
    state = reviewReducer(state, { type: "filter", value: "png" });
    state = reviewReducer(state, { type: "toggle-file", fileId: "f0" });
    state = reviewReducer(state, { type: "activate-file", fileId: "f1" });
    state = reviewReducer(state, { type: "open-comment", lineId: "line" });
    expect(state.filter).toBe("png");
    expect(state.collapsedFiles.has("f0")).toBe(true);
    expect(state.activeFileId).toBe("f1");
    expect(state.openLineId).toBe("line");
    state = reviewReducer(state, { type: "close-comment" });
    state = reviewReducer(state, { type: "submitting" });
    expect(state.phase).toBe("submitting");
    state = reviewReducer(state, { type: "submit-failed", error: "failed" });
    expect(state).toMatchObject({ phase: "ready", error: "failed", openLineId: null });
    state = reviewReducer(state, { type: "failed", error: "fatal" });
    expect(state.phase).toBe("error");
  });

  it("reveals the active file on explicit selection", () => {
    let state = reviewReducer(initialState, { type: "loaded", data });
    state = reviewReducer(state, { type: "toggle-directory", path: "tests" });
    state = reviewReducer(state, { type: "toggle-directory", path: "tests/rendering" });
    state = reviewReducer(state, { type: "activate-file", fileId: "f1" });
    expect(state.activeFileId).toBe("f1");
    expect(state.collapsedDirectories.has("tests")).toBe(false);
    expect(state.collapsedDirectories.has("tests/rendering")).toBe(false);
  });

  it("preserves collapsed directories during passive scroll tracking", () => {
    let state = reviewReducer(initialState, { type: "loaded", data });
    state = reviewReducer(state, { type: "toggle-directory", path: "tests" });
    state = reviewReducer(state, { type: "visible-file", fileId: "f1" });
    expect(state.activeFileId).toBe("f1");
    expect(state.collapsedDirectories.has("tests")).toBe(true);
    expect(reviewReducer(state, { type: "visible-file", fileId: "f1" })).toBe(state);
  });

  it("resets review-local state when a commit selection loads", () => {
    let state = reviewReducer(initialState, { type: "loaded", data });
    state = reviewReducer(state, { type: "save-comment", comment: {
      fileId: "f0", lineId: "f0:h0:l2", body: "draft",
    } });
    state = reviewReducer(state, { type: "selection-started" });
    expect(state.phase).toBe("selecting");
    state = reviewReducer(state, { type: "selection-loaded", data: { ...data, selectedCommitIds: [data.commits[0]!.id] } });
    expect(state.phase).toBe("ready");
    expect(state.drafts).toEqual({});
    expect(state.data?.selectedCommitIds).toEqual([data.commits[0]!.id]);
  });
});
