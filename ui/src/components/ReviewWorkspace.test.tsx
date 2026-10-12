import { render, screen, waitFor, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import fixture from "../__fixtures__/review.json";
import { ReviewApp } from "../App";
import type { ReviewBackend } from "../backend";
import type { HistoryCommit, ReviewData } from "../types";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ isMaximized: () => Promise.resolve(false), onResized: () => Promise.resolve(() => undefined) }),
}));

const review = fixture as ReviewData;
const baseId = review.comparison.mergeBaseId!;
const history: HistoryCommit[] = [
  ...review.commits.map((commit, index) => ({
    ...commit,
    parentIds: [review.commits[index + 1]?.id ?? baseId],
    refs: index === 1 ? ["main"] : [],
  })),
  { id: baseId, shortId: baseId.slice(0, 8), parentId: null, summary: "Base commit", message: "Base commit", author: "Base Author", authoredAt: 1_700_000_000, parentIds: [], refs: ["origin/main"] },
];

function setup(initialView: "changes" | "history" = "changes", data = review, historyCommits = history) {
  const backend: ReviewBackend = {
    getReview: vi.fn().mockResolvedValue(data),
    reloadReview: vi.fn().mockResolvedValue(data),
    getInitialView: vi.fn().mockResolvedValue(initialView),
    selectCommits: vi.fn().mockResolvedValue(review),
    getHistory: vi.fn().mockResolvedValue({ headRef: "main", commits: historyCommits, hasMore: false }),
    getHistoryFiles: vi.fn().mockResolvedValue(review.files),
    finishReview: vi.fn(),
    cancelReview: vi.fn().mockResolvedValue(undefined),
  };
  render(<ReviewApp backend={backend} />);
  return { backend, user: userEvent.setup() };
}

async function openHistory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "History" }));
  return screen.findByRole("listbox", { name: "Commits" });
}

describe("Review workspace", () => {
  it("does not mark a review boundary when HEAD has no review changes", async () => {
    const data = { ...review, commits: [], selectedCommitIds: [], files: [],
      comparison: { ...review.comparison, mergeBaseId: review.comparison.headId } };
    setup("history", data, [{ ...history[1]!, id: data.comparison.headId }]);
    const list = await screen.findByRole("listbox", { name: "Commits" });
    await within(list).findByText("Improve graphics options");
    expect(within(list).queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.getByText("No changed files")).toBeInTheDocument();
  });

  it("does not mark a boundary for a selected commit with no changes", async () => {
    const { backend, user } = setup();
    const list = await openHistory(user);
    vi.mocked(backend.selectCommits).mockResolvedValue({ ...review, files: [] });
    await user.click(await within(list).findByText("Improve graphics options"));
    await waitFor(() => expect(within(list).queryByRole("separator")).not.toBeInTheDocument());
    await screen.findByText("No changed files");
    expect(within(list).queryByRole("separator")).not.toBeInTheDocument();
  });

  it("preserves the same focused editor when changing layouts", async () => {
    const { user } = setup();
    await screen.findByText("5 commits against origin/main");
    screen.getByRole("main", { name: "Commit diff" }).focus();
    await user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp R27/ }));
    const editor = screen.getByRole("textbox", { name: "Review comment" });
    await user.type(editor, "Keep my unsaved note.");
    await openHistory(user);
    const historyScope = screen.getByRole("region", { name: "History" });
    await within(historyScope).findByRole("main", { name: "Commit diff" });
    expect(within(historyScope).getByRole("textbox", { name: "Review comment" })).toBe(editor);
    expect(editor).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Changes" }));
    await waitFor(() => expect(editor).toHaveFocus());
    expect(editor).toHaveValue("Keep my unsaved note.");
  });

  it("draws graph lanes through the base separator", async () => {
    const { user } = setup();
    const list = await openHistory(user);
    const marker = await within(list).findByRole("separator", { name: "Review base origin/main" });
    expect(marker.querySelector("svg")).toHaveAttribute("height", "20");
    expect(marker.querySelector("path")).toHaveAttribute("d", "M10 0V20");
    expect(marker.nextElementSibling).toHaveAttribute("data-commit-id", baseId);
    expect(marker.querySelector("svg circle")).toBeNull();
  });

  it("continues every active branch through the base separator", async () => {
    const rows = [
      { ...history[0]!, parentIds: [review.comparison.headId, baseId] },
      { ...history[1]!, parentIds: ["older"] },
      { ...history[history.length - 1]!, parentIds: ["older"] },
      { ...history[history.length - 1]!, id: "older", parentIds: [] },
    ];
    setup("history", review, rows);
    const list = await screen.findByRole("listbox", { name: "Commits" });
    const marker = await within(list).findByRole("separator", { name: "Review base origin/main" });
    expect([...marker.querySelectorAll("path")].map((path) => path.getAttribute("d"))).toEqual(["M10 0V20", "M24 0V20"]);
  });

  it.each([true, false])("marks HEAD for a worktree-only selection without a merge base (only virtual commit: %s)", async (onlyVirtual) => {
    const worktree = { ...history[0]!, parentIds: [review.comparison.headId] };
    const head = { ...history[1]!, id: review.comparison.headId, parentIds: [] };
    const data = { ...review, commits: onlyVirtual ? [review.commits[0]!] : review.commits, selectedCommitIds: ["WORKTREE"], comparison: { ...review.comparison, mergeBaseId: null } };
    setup("history", data, [worktree, head]);
    const list = await screen.findByRole("listbox", { name: "Commits" });
    const marker = await within(list).findByRole("separator", { name: "Review base HEAD" });
    expect(marker.previousElementSibling).toHaveAttribute("data-commit-id", "WORKTREE");
    expect(marker.nextElementSibling).toHaveAttribute("data-commit-id", review.comparison.headId);
    expect(marker.querySelector("path")).toHaveAttribute("d", "M10 0V20");
  });

  it("lists history with refs and the base marker while sharing the active review", async () => {
    const { backend, user } = setup();
    const list = await openHistory(user);

    expect(await within(list).findByText("Prepare graphics page")).toBeTruthy();
    expect(within(list).getByText("main")).toBeTruthy();
    expect(within(list).getByText("base: origin/main")).toBeTruthy();
    expect(screen.getByText("History", { selector: "span" })).toBeTruthy();
    expect(backend.getHistoryFiles).not.toHaveBeenCalled();
    expect(within(list).getAllByRole("option", { selected: true })).toHaveLength(review.commits.length);
    const section = screen.getByRole("region", { name: "History" });
    await within(section).findByRole("main", { name: "Commit diff" });
    const addButtons = within(section).queryAllByRole("button", { name: /^Add comment/, hidden: true });
    expect(addButtons.length).toBeGreaterThan(0);
    expect(addButtons.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
  });

  it("opens a shift-selected range in Changes", async () => {
    const { backend, user } = setup();
    const list = await openHistory(user);
    await user.click(await within(list).findByText("Improve graphics options"));
    await user.keyboard("{Shift>}");
    await user.click(within(list).getByText("Cover rendering options"));
    await user.keyboard("{/Shift}");

    expect(screen.getByText("3 commits selected")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Open in Changes" }));
    await waitFor(() => expect(backend.selectCommits).toHaveBeenCalledWith(review.commits.slice(1, 4).map((commit) => commit.id)));
    expect(screen.getByRole("button", { name: "Changes" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not open commits from before the review base", async () => {
    const { backend, user } = setup();
    const list = await openHistory(user);
    await user.click(await within(list).findByText("Base commit"));

    const open = screen.getByRole("button", { name: "Open in Changes" });
    expect((open as HTMLButtonElement).disabled).toBe(true);
    expect(open.getAttribute("title")).toBe("Only commits after origin/main can be reviewed");
    await user.dblClick(within(list).getByText("Base commit"));
    expect(backend.selectCommits).not.toHaveBeenCalled();
  });

  it("starts in History when asked to", async () => {
    setup("history");
    const list = await screen.findByRole("listbox", { name: "Commits" });
    expect(await within(list).findByText("Prepare graphics page")).toBeTruthy();
    expect(screen.getByRole("button", { name: "History" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("moves between commit, file and diff panes and finds in the focused one", async () => {
    Element.prototype.scrollTo = vi.fn();
    const { user } = setup();
    const list = await openHistory(user);
    await within(list).findByText("Prepare graphics page");
    const section = screen.getByRole("region", { name: "History" });
    await within(section).findByRole("main", { name: "Commit diff" });
    const commits = list.closest<HTMLElement>("[data-pane]")!;
    const files = within(section).getByRole("complementary", { name: "Changed files" });
    const diff = within(section).getByRole("main", { name: "Commit diff" });
    const activeFile = () => files.querySelector("[aria-current='true']")?.textContent;
    const selectedCommit = () => within(list).getAllByRole("option", { selected: true })[0]!.textContent;
    expect(document.activeElement).toBe(commits);

    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(files);
    const commit = selectedCommit();
    const first = activeFile();
    await user.keyboard("{ArrowDown}");
    expect(activeFile()).not.toBe(first);
    expect(selectedCommit()).toBe(commit);
    await user.keyboard("{Control>}f{/Control}");
    expect(document.activeElement).toBe(within(section).getByRole("searchbox", { name: "Filter files" }));

    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(diff);
    const second = activeFile();
    await user.keyboard("{ArrowUp}");
    expect(activeFile()).toBe(second);
    await user.keyboard("k");
    expect(activeFile()).toBe(first);

    await user.keyboard("/");
    const find = await within(section).findByRole("searchbox", { name: "Find in code" });
    await waitFor(() => expect(document.activeElement).toBe(find));
    await user.keyboard("graphics");
    expect(within(section).getByRole("status").textContent).toMatch(/of|No results/);
    await user.keyboard("{Enter}{Shift>}{Enter}{/Shift}");
    await user.keyboard("{Escape}");
    expect(within(section).queryByRole("search", { name: "Find in diff" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(diff);
    expect(screen.getByRole("button", { name: "History" }).getAttribute("aria-pressed")).toBe("true");

    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(commits);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(diff);
    Reflect.deleteProperty(Element.prototype, "scrollTo");
  });

  it("moves with the keyboard and switches views with shortcuts", async () => {
    const { backend, user } = setup();
    await screen.findByRole("button", { name: "History" });
    await user.keyboard("v");
    const list = await screen.findByRole("listbox", { name: "Commits" });
    await within(list).findByText("Prepare graphics page");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(within(list).getAllByRole("option", { selected: true })[0]!.textContent).toContain("Add graphics labels");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(backend.selectCommits).toHaveBeenCalledWith([review.commits[2]!.id]));

    await user.keyboard("v");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Changes" }).getAttribute("aria-pressed")).toBe("true");
    expect(backend.cancelReview).not.toHaveBeenCalled();
  });

  it("jumps, filters, steps files and toggles the message from the keyboard", async () => {
    Element.prototype.scrollTo = vi.fn();
    const { user } = setup();
    const list = await openHistory(user);
    await within(list).findByText("Prepare graphics page");
    const selectedText = () => within(list).getAllByRole("option", { selected: true }).map((option) => option.textContent);

    await waitFor(() => expect(selectedText()).toHaveLength(review.commits.length));
    await user.keyboard("{End}");
    expect(selectedText()[0]).toContain("Base commit");
    await user.keyboard("g");
    expect(selectedText()[0]).toContain("Uncommitted changes");
    await user.keyboard("{Shift>}G{/Shift}");
    expect(selectedText()[0]).toContain("Base commit");
    await user.keyboard("{Home}{Shift>}{ArrowDown}{ArrowDown}{/Shift}");
    expect(selectedText()).toHaveLength(3);

    await user.keyboard("g");
    const section = screen.getByRole("region", { name: "History" });
    await within(section).findByRole("main", { name: "Commit diff" });
    await waitFor(() => expect(within(section).queryByText("Loading changes...")).not.toBeInTheDocument());
    const tree = within(section).getByRole("navigation", { name: "File tree" });
    const activeFile = () => tree.querySelector("[aria-current='true']")?.textContent;
    const first = activeFile();
    await user.keyboard("]");
    expect(activeFile()).not.toBe(first);
    await user.keyboard("[[");
    expect(activeFile()).toBe(first);

    await user.keyboard("m");
    expect(screen.getByRole("button", { name: "Hide message" })).toBeTruthy();
    expect(within(list).getAllByLabelText(/more lines? in the message/)).toHaveLength(1);
    await user.keyboard("{ArrowDown}");
    expect(selectedText()[0]).toContain("Improve graphics options");
    expect(screen.getByRole("button", { name: "Hide message" })).toBeTruthy();
    await user.keyboard("{ArrowDown}");
    expect(screen.queryByRole("button", { name: /message/ })).not.toBeInTheDocument();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: "Hide message" })).toBeTruthy();

    await user.keyboard("/");
    const filter = screen.getByRole("searchbox", { name: "Filter commits" });
    expect(document.activeElement).toBe(filter);
    await user.keyboard("Base");
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect((filter as HTMLInputElement).value).toBe("");
    await user.keyboard("{Escape}");
    expect(document.activeElement).not.toBe(filter);
    expect(screen.getByRole("button", { name: "History" }).getAttribute("aria-pressed")).toBe("true");
    Reflect.deleteProperty(Element.prototype, "scrollTo");
  });

  it("cascades the commit and file filters through both layouts", async () => {
    const { backend, user } = setup();
    const list = await openHistory(user);
    const id = review.commits[2]!.id;
    const files = [review.files[0]!, { ...review.files[0]!, id: "docs", displayPath: "docs/notes.md" }];
    vi.mocked(backend.selectCommits).mockResolvedValue({ ...review, selectedCommitIds: [id], files });
    await user.type(screen.getByRole("searchbox", { name: "Filter commits" }), "Add graphics");
    expect(within(list).getAllByRole("option", { selected: true })).toHaveLength(1);
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith([id]));
    await screen.findByTitle("docs/notes.md");
    const diff = screen.getByRole("main", { name: "Commit diff" });
    const fileFilter = screen.getByRole("searchbox", { name: "Filter files" });
    await user.type(fileFilter, "notes");
    expect([...diff.querySelectorAll("article")].map((card) => card.dataset.fileId)).toEqual(["docs"]);
    const tree = screen.getByRole("navigation", { name: "File tree" });
    expect([...tree.querySelectorAll("[data-file-id]")].map((row) => (row as HTMLElement).dataset.fileId)).toEqual(["docs"]);
    expect(tree.querySelector("[aria-current='true']")).toHaveAttribute("data-file-id", "docs");

    await user.click(screen.getByRole("button", { name: "Changes" }));
    expect(screen.getByRole("main", { name: "Commit diff" })).toBe(diff);
    expect(screen.getByRole("searchbox", { name: "Filter files" })).toBe(fileFilter);
    expect(fileFilter).toHaveValue("notes");
    expect(screen.getByTitle("Choose commits to review")).toHaveTextContent("Add graphics labels");
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByRole("searchbox", { name: "Filter commits" })).toHaveValue("Add graphics");
    expect(screen.getByRole("main", { name: "Commit diff" })).toBe(diff);
    expect(backend.selectCommits).toHaveBeenCalledOnce();
  });

  it("empties both downstream panes when a commit filter matches nothing", async () => {
    const { backend, user } = setup();
    const list = await openHistory(user);
    await user.type(screen.getByRole("searchbox", { name: "Filter commits" }), "missing-commit");
    await screen.findByText("No matching commits");
    expect(within(list).queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("navigation", { name: "File tree" }).querySelector("[data-file-id]")).toBeNull();
    expect(screen.getByRole("main", { name: "Commit diff" }).querySelector("article")).toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    screen.getByRole("main", { name: "Commit diff" }).focus();
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(backend.finishReview).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Changes" }));
    expect(screen.getByText("No matching commits")).toBeInTheDocument();
  });

  it("keeps an outside-base preview read-only when switching layouts", async () => {
    const { backend, user } = setup();
    const list = await openHistory(user);
    await user.click(await within(list).findByText("Base commit"));
    await waitFor(() => expect(backend.getHistoryFiles).toHaveBeenCalledWith([baseId]));
    await screen.findByText("Binary file changed");
    await user.click(screen.getByRole("button", { name: "Changes" }));
    expect(screen.getByTitle("Choose commits to review")).toHaveTextContent("Base commit");
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /^Add comment/ }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    screen.getByRole("main", { name: "Commit diff" }).focus();
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(backend.finishReview).not.toHaveBeenCalled();
  });

  it("preserves code search and restores diff focus across layouts", async () => {
    const { user } = setup();
    await screen.findByText("5 commits against origin/main");
    const diff = screen.getByRole("main", { name: "Commit diff" });
    diff.focus();
    await user.keyboard("{Control>}f{/Control}");
    const find = screen.getByRole("searchbox", { name: "Find in code" });
    await user.type(find, "labelEn");
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByRole("searchbox", { name: "Find in code" })).toBe(find);
    expect(find).toHaveValue("labelEn");
    expect(find).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(diff).toHaveFocus();
  });
});
