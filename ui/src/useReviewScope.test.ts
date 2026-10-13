import { act, renderHook, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/review.json";
import { useReviewScope } from "./useReviewScope";
import type { ReviewBackend } from "./backend";
import type { HistoryCommit, ReviewData } from "./types";

const review = fixture as ReviewData;
const history: HistoryCommit[] = review.commits.map((commit) => ({ ...commit, parentIds: [], refs: [] }));
const older: HistoryCommit = { ...history[1]!, id: "older", summary: "Older commit", message: "Older commit", author: "Base Author", refs: ["main"] };
const fileFor = (id: string) => ({ ...review.files[0]!, id, displayPath: `src/${id}.rs` });

async function setup(data = review, historyCommits = [...history, older]) {
  const backend: ReviewBackend = {
    getReview: vi.fn().mockResolvedValue(data),
    reloadReview: vi.fn().mockResolvedValue(data),
    getInitialView: vi.fn().mockResolvedValue("changes"),
    selectCommits: vi.fn().mockImplementation(async (ids: string[]) => ({
      ...review, selectedCommitIds: ids, files: ids.length === 0 ? review.files : ids.map(fileFor),
    })),
    getHistory: vi.fn().mockResolvedValue({ headRef: "main", commits: historyCommits, hasMore: false }),
    getHistoryFiles: vi.fn().mockImplementation(async (ids: string[]) => ids.map(fileFor)),
    finishReview: vi.fn(),
    cancelReview: vi.fn(),
  };
  const hook = renderHook(() => useReviewScope(backend, true));
  await waitFor(() => expect(hook.result.current.state.phase).toBe("ready"));
  await waitFor(() => expect(hook.result.current.commits).toHaveLength(historyCommits.length));
  return { ...hook, backend };
}

describe("review scope", () => {
  it("shares a filled range across history selection, files and the commit picker", async () => {
    const { result, backend } = await setup();
    const ids = review.commits.slice(1, 4).map((commit) => commit.id);
    act(() => result.current.selectHistory([ids[2]!, ids[0]!]));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.selectedIds).toEqual(ids);
    expect(result.current.data?.selectedCommitIds).toEqual(ids);
    expect(result.current.data?.files.map((file) => file.id)).toEqual(ids);
    expect(backend.selectCommits).toHaveBeenCalledWith(ids);
  });

  it("keeps intervening commits visible when a filter matches only the endpoints", async () => {
    const filteredHistory = history.map((commit, index) => ({
      ...commit, message: index === 1 || index === 3 ? "batch endpoint" : commit.message,
    }));
    const { result } = await setup(review, [...filteredHistory, older]);
    act(() => result.current.filterCommits("batch endpoint"));
    const ids = review.commits.slice(1, 4).map((commit) => commit.id);
    expect(result.current.visibleCommits.map((commit) => commit.id)).toEqual(ids);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.data?.commits.map((commit) => commit.id)).toEqual(ids);
    expect(result.current.data?.files.map((file) => file.id)).toEqual(ids);
  });

  it("rejects incompatible histories without loading files or allowing approval", async () => {
    const { result, backend } = await setup();
    act(() => result.current.selectHistory(["WORKTREE", "older"]));
    expect(result.current.pending).toBe(false);
    expect(result.current.disabledReason).toContain("first-parent");
    expect(result.current.data?.files).toEqual([]);
    expect(backend.selectCommits).not.toHaveBeenCalled();
    expect(backend.getHistoryFiles).not.toHaveBeenCalled();
    act(() => result.current.selectCommits([]));
    expect(result.current.state.error).toBeNull();
    expect(result.current.data?.files).toEqual(review.files);
    act(() => result.current.selectHistory([review.commits[1]!.id]));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.state.error).toBeNull();
  });

  it("reloads files and history while keeping the file filter", async () => {
    const { result, backend } = await setup();
    const updated = { ...review, selectedCommitIds: ["WORKTREE"], files: [fileFor("fresh")] };
    vi.mocked(backend.reloadReview).mockResolvedValue(updated);
    act(() => result.current.dispatch({ type: "filter", value: "fresh" }));
    await act(async () => { expect(await result.current.reload()).toBe(true); });
    expect(result.current.data?.files).toEqual(updated.files);
    expect(result.current.selectedIds).toEqual(["WORKTREE"]);
    expect(result.current.state.filter).toBe("fresh");
    expect(backend.getHistory).toHaveBeenCalledTimes(2);
    expect(backend.selectCommits).not.toHaveBeenCalled();
  });

  it("keeps the snapshot and drafts when reload fails", async () => {
    const { result, backend } = await setup();
    act(() => result.current.dispatch({ type: "save-comment", comment: { fileId: "f0", lineId: "f0:h0:l1", body: "Keep me" } }));
    vi.mocked(backend.reloadReview).mockRejectedValue(new Error("Cannot read repository"));
    await act(async () => { expect(await result.current.reload()).toBe(false); });
    expect(result.current.state.drafts["f0:h0:l1"]?.body).toBe("Keep me");
    expect(result.current.data?.files).toEqual(review.files);
    expect(result.current.state.error).toBe("Cannot read repository");
    expect(result.current.pending).toBe(false);
  });

  it("starts from the same commit selection as the review", async () => {
    const { result, backend } = await setup({ ...review, selectedCommitIds: ["WORKTREE"] });
    expect(result.current.selectedIds).toEqual(["WORKTREE"]);
    expect(result.current.data?.files).toEqual(review.files);
    expect(backend.selectCommits).not.toHaveBeenCalled();
    expect(backend.getHistoryFiles).not.toHaveBeenCalled();
  });

  it("cascades commit filters to the files and excludes the old selection", async () => {
    const { result, backend } = await setup({ ...review, selectedCommitIds: ["WORKTREE"] });
    act(() => result.current.filterCommits("Add graphics"));
    const id = review.commits[2]!.id;
    expect(result.current.visibleCommits.map((commit) => commit.id)).toEqual([id]);
    expect(result.current.selectedIds).toEqual([id]);
    expect(result.current.data?.files).toEqual([]);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.data?.files.map((file) => file.id)).toEqual([id]);
    expect(backend.selectCommits).toHaveBeenCalledWith([id]);
  });

  it("loads every matching commit and supports filtering the full message", async () => {
    const { result } = await setup();
    act(() => result.current.filterCommits("Local User"));
    expect(result.current.selectedIds).toEqual(review.commits.slice(1).map((commit) => commit.id));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.data?.files).toHaveLength(4);
    const body = review.commits[1]!.message.split("\n").at(-1)!;
    act(() => result.current.filterCommits(body));
    expect(result.current.selectedIds).toEqual([review.commits[1]!.id]);
  });

  it("does not turn zero matching commits into the whole comparison", async () => {
    const { result, backend } = await setup();
    act(() => result.current.filterCommits("missing-commit"));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.data?.files).toEqual([]);
    expect(result.current.disabledReason).toBe("No commits selected");
    expect(backend.selectCommits).not.toHaveBeenCalled();
    act(() => result.current.filterCommits(""));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.data?.files).toEqual(review.files);
  });

  it("distinguishes clearing the selection from showing the comparison", async () => {
    const { result } = await setup();
    act(() => result.current.selectHistory([]));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.disabledReason).toBe("No commits selected");
    act(() => result.current.selectCommits([]));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.disabledReason).toBeNull();
    expect(result.current.selectedIds).toEqual(review.commits.map((commit) => commit.id));
  });

  it("keeps historical previews outside the base read-only", async () => {
    const { result, backend } = await setup();
    act(() => result.current.filterCommits("Older"));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.data?.files.map((file) => file.id)).toEqual(["older"]);
    expect(result.current.disabledReason).toBe("Only commits after origin/main can be reviewed");
    expect(backend.getHistoryFiles).toHaveBeenCalledWith(["older"]);
    expect(backend.selectCommits).not.toHaveBeenCalled();
  });

  it("ignores an obsolete commit response", async () => {
    const { result, backend } = await setup();
    let finishOlder!: (data: ReviewData) => void;
    vi.mocked(backend.selectCommits).mockImplementationOnce(() => new Promise((resolve) => { finishOlder = resolve; }));
    act(() => result.current.selectHistory([review.commits[1]!.id]));
    await waitFor(() => expect(backend.selectCommits).toHaveBeenCalledTimes(1));
    act(() => result.current.selectHistory([review.commits[2]!.id]));
    expect(result.current.data?.files).toEqual([]);
    await act(async () => finishOlder({ ...review, files: [fileFor("obsolete")] }));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.data?.files[0]?.id).toBe(review.commits[2]!.id);
  });

  it("returns to the loaded comparison while a request is still pending", async () => {
    const { result, backend } = await setup();
    let finish!: (data: ReviewData) => void;
    vi.mocked(backend.selectCommits).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    act(() => result.current.selectHistory([review.commits[1]!.id]));
    await waitFor(() => expect(backend.selectCommits).toHaveBeenCalledOnce());
    act(() => result.current.selectCommits([]));
    expect(result.current.pending).toBe(true);
    await act(async () => finish({ ...review, files: [fileFor("obsolete")] }));
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    expect(result.current.pending).toBe(false);
    expect(result.current.data?.files).toEqual(review.files);
    expect(backend.selectCommits).toHaveBeenLastCalledWith([]);
  });

  it("does not reveal old files or allow approval after a selection fails", async () => {
    const { result, backend } = await setup();
    vi.mocked(backend.selectCommits).mockRejectedValueOnce(new Error("Cannot load commit"));
    act(() => result.current.selectHistory([review.commits[1]!.id]));
    await waitFor(() => expect(result.current.state.error).toBe("Cannot load commit"));
    expect(result.current.pending).toBe(false);
    expect(result.current.data?.files).toEqual([]);
    expect(result.current.disabledReason).toBe("Could not load selected commits");
    act(() => result.current.selectHistory([review.commits[2]!.id]));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.state.error).toBeNull();
  });

  it("preserves comments while rejecting a different commit scope", async () => {
    const { result } = await setup();
    act(() => result.current.dispatch({ type: "save-comment", comment: { fileId: "f0", lineId: "f0:h0:l1", body: "Keep this note" } }));
    act(() => {
      result.current.filterCommits("Older");
      result.current.selectCommits([review.commits[1]!.id]);
      result.current.selectHistory([]);
    });
    expect(result.current.commitFilter).toBe("");
    expect(result.current.selectedIds).toEqual(review.commits.map((commit) => commit.id));
    expect(result.current.state.drafts["f0:h0:l1"]?.body).toBe("Keep this note");
  });
});
