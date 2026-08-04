import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/review.json";
import { ReviewApp } from "./App";
import type { ReviewBackend } from "./backend";
import type { ReviewData, SubmittedReview } from "./types";

function setup() {
  const submissions: SubmittedReview[] = [];
  const backend: ReviewBackend = {
    getReview: vi.fn().mockResolvedValue(fixture as ReviewData),
    selectCommits: vi.fn().mockResolvedValue(fixture as ReviewData),
    finishReview: vi.fn(async (review) => { submissions.push(review); }),
    cancelReview: vi.fn().mockResolvedValue(undefined),
  };
  render(<ReviewApp backend={backend} />);
  return { backend, submissions, user: userEvent.setup() };
}

describe("ReviewApp", () => {
  it("renders the commit, tree, text diff, and binary placeholder", async () => {
    setup();
    expect(await screen.findByText("Improve graphics options")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "File tree" })).toBeInTheDocument();
    expect(screen.getByText("const char* labelEn;", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Binary file changed")).toBeInTheDocument();
  });

  it("shows commit details whenever the effective review contains one commit", async () => {
    const commit = (fixture as ReviewData).commits[0]!;
    const renderReview = (selectedCommitIds: string[]) => {
      const data = { ...(fixture as ReviewData), commits: [commit], selectedCommitIds };
      const backend: ReviewBackend = {
        getReview: vi.fn().mockResolvedValue(data),
        selectCommits: vi.fn(),
        finishReview: vi.fn(),
        cancelReview: vi.fn(),
      };
      render(<ReviewApp backend={backend} />);
    };

    renderReview([]);
    let trigger = await screen.findByTitle("Choose commits to review");
    expect(within(trigger).getByText(`${commit.shortId} by ${commit.author}`)).toBeInTheDocument();
    expect(within(trigger).queryByText(/1 commit ·/)).not.toBeInTheDocument();

    cleanup();
    renderReview([commit.id]);
    trigger = await screen.findByTitle("Choose commits to review");
    expect(within(trigger).getByText(`${commit.shortId} by ${commit.author}`)).toBeInTheDocument();
    expect(within(trigger).queryByText(/1 commit ·/)).not.toBeInTheDocument();
  });

  it("selects arbitrary commits, one commit, or the full branch diff", async () => {
    const { backend, user } = setup();
    await screen.findByText("Improve graphics options");
    const trigger = screen.getByTitle("Choose commits to review");

    await user.click(trigger);
    const picker = screen.getByRole("dialog", { name: "Choose commits" });
    expect(within(picker).getAllByRole("checkbox")).toHaveLength(4);
    await user.click(within(picker).getByText("Add graphics labels"));
    await user.click(within(picker).getByText("Prepare graphics page"));
    await user.click(within(picker).getByRole("button", { name: "Show (2)" }));
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith([
      "1111111111111111111111111111111111111111",
      "3333333333333333333333333333333333333333",
    ]));

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Show only Cover rendering options" }));
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith([
      "2222222222222222222222222222222222222222",
    ]));

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Show all" }));
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith([]));
  });

  it("dismisses the commit picker with Escape without closing the app", async () => {
    const { backend, user } = setup();
    await screen.findByText("Improve graphics options");
    await user.click(screen.getByTitle("Choose commits to review"));
    expect(screen.getByRole("dialog", { name: "Choose commits" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Choose commits" })).not.toBeInTheDocument();
    expect(backend.cancelReview).not.toHaveBeenCalled();
  });

  it("labels repeated file diffs with their source commit", async () => {
    const sourceCommit = (fixture as ReviewData).commits[1]!;
    const selected = {
      ...(fixture as ReviewData),
      selectedCommitIds: [sourceCommit.id],
      files: (fixture as ReviewData).files.map((file, index) => index === 0 ? { ...file, sourceCommit } : file),
    };
    const backend: ReviewBackend = {
      getReview: vi.fn().mockResolvedValue(selected),
      selectCommits: vi.fn(),
      finishReview: vi.fn(),
      cancelReview: vi.fn(),
    };
    render(<ReviewApp backend={backend} />);
    await screen.findByTitle("Choose commits to review");
    expect(screen.getAllByText(sourceCommit.shortId)).toHaveLength(2);
    expect(screen.getByTitle(`${sourceCommit.shortId} · ${sourceCommit.summary}`)).toBeInTheDocument();
  });

  it("filters files and collapses directories", async () => {
    const { user } = setup();
    await screen.findByText("Improve graphics options");
    const filter = screen.getByRole("searchbox", { name: "Filter files" });
    await user.type(filter, "reference");
    expect(screen.queryByText("GraphicsPage.cpp")).not.toBeInTheDocument();
    expect(screen.getByText("reference.png")).toBeInTheDocument();
    await user.clear(filter);
    const engine = screen.getByRole("button", { name: /^engine$/ });
    await user.click(engine);
    expect(engine).toHaveAttribute("aria-expanded", "false");
  });

  it("tracks the visible diff file and follows it in the sidebar", async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    setup();
    await screen.findByText("Improve graphics options");
    scrollIntoView.mockClear();
    const pane = screen.getByRole("main", { name: "Commit diff" });
    const cards = pane.querySelectorAll<HTMLElement>("article[data-file-id]");
    const target = screen.getByTitle("tests/rendering/reference.png");

    Object.defineProperties(pane, {
      scrollTop: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    pane.getBoundingClientRect = vi.fn(() => ({ top: 0 }) as DOMRect);
    cards[0]!.getBoundingClientRect = vi.fn(() => ({ top: -300 }) as DOMRect);
    cards[1]!.getBoundingClientRect = vi.fn(() => ({ top: 10 }) as DOMRect);
    const animationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => window.setTimeout(() => callback(0), 0));

    fireEvent.scroll(pane);
    await waitFor(() => expect(target).toHaveAttribute("aria-current", "true"));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" }));
    animationFrame.mockRestore();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("collapses file cards and deletes draft comments", async () => {
    const { user } = setup();
    await screen.findByText("Improve graphics options");
    const fileHeader = screen.getByRole("button", { name: /^engine\/GraphicsPage\.cpp$/ });
    await user.click(fileHeader);
    expect(fileHeader).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("const char* labelEn;", { exact: false })).not.toBeInTheDocument();
    await user.click(fileHeader);
    await user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp L26/ }));
    await user.type(screen.getByRole("textbox", { name: "Review comment" }), "Remove this.");
    await user.click(screen.getByRole("button", { name: "Save comment" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByText("Remove this.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("cancels an open editor with Escape", async () => {
    const { backend, user } = setup();
    await screen.findByText("Improve graphics options");
    await user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp R27/ }));
    await user.type(screen.getByRole("textbox", { name: "Review comment" }), "unsaved");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Review comment" })).not.toBeInTheDocument();
    expect(backend.cancelReview).not.toHaveBeenCalled();
  });

  it.each([
    ["Escape", {}],
    ["Control+W", { key: "w", ctrlKey: true }],
    ["Command+W", { key: "w", metaKey: true }],
    ["Alt+F4", { key: "F4", altKey: true }],
  ])("closes the review with %s", async (_name, shortcut) => {
    const { backend } = setup();
    await screen.findByText("Improve graphics options");
    fireEvent.keyDown(document, "key" in shortcut ? shortcut : { key: "Escape" });
    await waitFor(() => expect(backend.cancelReview).toHaveBeenCalledOnce());
  });

  it("creates, edits, and shares a line comment", async () => {
    const { user, submissions } = setup();
    await screen.findByText("Improve graphics options");
    await user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp R26/ }));
    const editor = screen.getByRole("group", { name: "Comment on R26" });
    await user.type(within(editor).getByRole("textbox", { name: "Review comment" }), "Please explain this.");
    await user.click(within(editor).getByRole("button", { name: "Save comment" }));
    expect(screen.getByText("Please explain this.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const edited = screen.getByRole("textbox", { name: "Review comment" });
    await user.clear(edited);
    await user.type(edited, "Use a named constant.");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await user.click(screen.getByRole("button", { name: "Share comments" }));
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toEqual({ outcome: "share", comments: [{ fileId: "f0", lineId: "f0:h0:l2", body: "Use a named constant." }] });
  });

  it("approves when no drafts exist", async () => {
    const { user, submissions } = setup();
    await screen.findByText("Improve graphics options");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(submissions[0]).toEqual({ outcome: "approve", comments: [] }));
  });

  it("runs the context-sensitive primary action with Control+Enter", async () => {
    const first = setup();
    await screen.findByText("Improve graphics options");
    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(first.submissions[0]).toEqual({ outcome: "approve", comments: [] }));

    cleanup();
    const second = setup();
    await screen.findByText("Improve graphics options");
    await second.user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp R26/ }));
    await second.user.type(screen.getByRole("textbox", { name: "Review comment" }), "Please reconsider this.");
    await second.user.click(screen.getByRole("button", { name: "Save comment" }));
    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(second.submissions[0]).toEqual({
      outcome: "share",
      comments: [{ fileId: "f0", lineId: "f0:h0:l2", body: "Please reconsider this." }],
    }));
  });

  it("uses Control+Enter to save an open editor without submitting the review", async () => {
    const { submissions, user } = setup();
    await screen.findByText("Improve graphics options");
    await user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp R26/ }));
    const editor = screen.getByRole("textbox", { name: "Review comment" });
    await user.type(editor, "Draft only.");
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Review comment" })).not.toBeInTheDocument());
    expect(screen.getByText("Draft only.")).toBeInTheDocument();
    expect(submissions).toHaveLength(0);
  });

  it("reports submission failures and restores the actions", async () => {
    const backend: ReviewBackend = {
      getReview: vi.fn().mockResolvedValue(fixture as ReviewData),
      selectCommits: vi.fn(),
      finishReview: vi.fn().mockRejectedValue(new Error("IPC failed")),
      cancelReview: vi.fn(),
    };
    const user = userEvent.setup();
    render(<ReviewApp backend={backend} />);
    await screen.findByText("Improve graphics options");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("IPC failed");
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("shows loading failures", async () => {
    const backend: ReviewBackend = {
      getReview: vi.fn().mockRejectedValue(new Error("No repository")),
      selectCommits: vi.fn(),
      finishReview: vi.fn(),
      cancelReview: vi.fn(),
    };
    render(<ReviewApp backend={backend} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No repository");
  });

  it("shows the empty commit state", async () => {
    const empty = { ...(fixture as ReviewData), files: [] };
    const backend: ReviewBackend = {
      getReview: vi.fn().mockResolvedValue(empty),
      selectCommits: vi.fn(),
      finishReview: vi.fn(),
      cancelReview: vi.fn(),
    };
    render(<ReviewApp backend={backend} />);
    expect(await screen.findByText("No changed files")).toBeInTheDocument();
  });
});
