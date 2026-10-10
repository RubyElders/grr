import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
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

function setup() {
  const backend: ReviewBackend = {
    getReview: vi.fn().mockResolvedValue(review),
    selectCommits: vi.fn().mockResolvedValue(review),
    getHistory: vi.fn().mockResolvedValue({ headRef: "main", commits: history, hasMore: false }),
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

describe("HistoryView", () => {
  it("lists history with refs and the base marker and shows the selected commit read-only", async () => {
    const { backend, user } = setup();
    const list = await openHistory(user);

    expect(await within(list).findByText("Prepare graphics page")).toBeTruthy();
    expect(within(list).getByText("main")).toBeTruthy();
    expect(within(list).getByText("base: origin/main")).toBeTruthy();
    expect(screen.getByText("History", { selector: "span" })).toBeTruthy();
    await waitFor(() => expect(backend.getHistoryFiles).toHaveBeenCalledWith(["WORKTREE"]));
    const section = screen.getByRole("region", { name: "History" });
    await within(section).findByRole("main", { name: "Commit diff" });
    const addButtons = within(section).queryAllByRole("button", { name: /^Add comment/, hidden: true });
    expect(addButtons.length).toBeGreaterThan(0);
    expect(addButtons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
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
    expect(backend.selectCommits).toHaveBeenCalledWith(review.commits.slice(1, 4).map((commit) => commit.id));
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

  it("moves with the keyboard and switches views with shortcuts", async () => {
    const { backend, user } = setup();
    await screen.findByRole("button", { name: "History" });
    fireEvent.keyDown(document, { key: "2", ctrlKey: true });
    const list = await screen.findByRole("listbox", { name: "Commits" });
    await within(list).findByText("Prepare graphics page");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(within(list).getAllByRole("option", { selected: true })[0]!.textContent).toContain("Add graphics labels");
    await user.keyboard("{Enter}");
    expect(backend.selectCommits).toHaveBeenCalledWith([review.commits[2]!.id]);

    fireEvent.keyDown(document, { key: "2", ctrlKey: true });
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Changes" }).getAttribute("aria-pressed")).toBe("true");
    expect(backend.cancelReview).not.toHaveBeenCalled();
  });

  it("jumps, filters, steps files and toggles the message from the keyboard", async () => {
    const { user } = setup();
    const list = await openHistory(user);
    await within(list).findByText("Prepare graphics page");
    const selectedText = () => within(list).getAllByRole("option", { selected: true }).map((option) => option.textContent);

    await waitFor(() => expect(selectedText()).toHaveLength(1));
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
  });
});
