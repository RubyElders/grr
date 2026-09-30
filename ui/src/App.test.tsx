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
    expect(await screen.findByText("5 commits against origin/main")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "grr" })).toBeInTheDocument();
    const commitSelector = screen.getByTitle("Choose commits to review");
    expect(within(commitSelector).getByText("5 commits against origin/main")).toBeInTheDocument();
    expect(commitSelector).toHaveTextContent("virtual by Local working tree (1), Local User (4)");
    expect(within(commitSelector).queryByText("Virtual")).not.toBeInTheDocument();
    const message = screen.getByRole("region", { name: "Commit message" });
    expect(message).toHaveTextContent("Virtual commit.");
    expect(message.querySelector("code")).toBeNull();
    expect(screen.getByRole("navigation", { name: "File tree" })).toBeInTheDocument();
    expect(screen.getByLabelText(/const char\* labelEn;/)).toBeInTheDocument();
    expect(screen.getByText("Binary file changed")).toBeInTheDocument();
  });

  it("presents a selected virtual commit independently from the comparison", async () => {
    const data = { ...(fixture as ReviewData), selectedCommitIds: ["WORKTREE"] };
    const backend: ReviewBackend = {
      getReview: vi.fn().mockResolvedValue(data),
      selectCommits: vi.fn(),
      finishReview: vi.fn(),
      cancelReview: vi.fn(),
    };
    render(<ReviewApp backend={backend} />);

    const trigger = await screen.findByTitle("Choose commits to review");
    expect(trigger).toHaveTextContent("Uncommitted changes");
    expect(trigger).toHaveTextContent("worktree by Local working tree");
    expect(trigger).not.toHaveTextContent("5 commits against origin/main");
  });

  it("renders diff files in the same order as the file tree", async () => {
    const data = { ...(fixture as ReviewData), files: [...(fixture as ReviewData).files].reverse() };
    const backend: ReviewBackend = {
      getReview: vi.fn().mockResolvedValue(data),
      selectCommits: vi.fn(),
      finishReview: vi.fn(),
      cancelReview: vi.fn(),
    };
    render(<ReviewApp backend={backend} />);
    await screen.findByText("5 commits against origin/main");

    const tree = screen.getByRole("navigation", { name: "File tree" });
    const pane = screen.getByRole("main", { name: "Commit diff" });
    const fileIds = (root: HTMLElement, selector: string) => Array.from(root.querySelectorAll<HTMLElement>(selector))
      .map((element) => element.dataset.fileId);

    expect(fileIds(pane, "article[data-file-id]")).toEqual(fileIds(tree, "[data-file-id]"));
    expect(fileIds(pane, "article[data-file-id]")).toEqual(["f0", "f1"]);
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
    expect(trigger).toHaveTextContent(`${commit.shortId} by ${commit.author}`);
    expect(within(trigger).queryByText(/1 commit ·/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No newer commit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No older commit" })).toBeDisabled();
    await userEvent.setup().click(trigger);
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();

    cleanup();
    renderReview([commit.id]);
    trigger = await screen.findByTitle("Choose commits to review");
    expect(trigger).toHaveTextContent(`${commit.shortId} by ${commit.author}`);
    expect(within(trigger).queryByText(/1 commit ·/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No newer commit" })).toBeDisabled();
  });

  it("shows an empty comparison without inventing a grouped commit", async () => {
    const source = fixture as ReviewData;
    const data = { ...source, commits: [], selectedCommitIds: [], files: [] };
    const backend: ReviewBackend = {
      getReview: vi.fn().mockResolvedValue(data),
      selectCommits: vi.fn(),
      finishReview: vi.fn(),
      cancelReview: vi.fn(),
    };
    const user = userEvent.setup();
    render(<ReviewApp backend={backend} />);

    const trigger = await screen.findByTitle("Choose commits to review");
    expect(within(trigger).getByText("No commits to review")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Commit message" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No newer commit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No older commit" })).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
  });

  it("selects arbitrary commits, one commit, or the full branch diff", async () => {
    const { backend, user } = setup();
    await screen.findByText("5 commits against origin/main");
    const trigger = screen.getByTitle("Choose commits to review");

    await user.click(trigger);
    const picker = screen.getByRole("dialog", { name: "Choose commits" });
    expect(within(picker).getAllByRole("checkbox")).toHaveLength(5);
    await user.click(within(picker).getByRole("checkbox", { name: /Add graphics labels/ }));
    await user.click(within(picker).getByRole("checkbox", { name: /Prepare graphics page/ }));
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

  it("opens and browses the commit selector entirely from the keyboard", async () => {
    const source = fixture as ReviewData;
    const { backend } = setup();
    await screen.findByText("5 commits against origin/main");

    fireEvent.keyDown(document, { key: "c" });
    const picker = screen.getByRole("dialog", { name: "Choose commits" });
    const rows = picker.querySelectorAll<HTMLElement>("[data-commit-index]");
    const showAll = within(picker).getByRole("button", { name: "Show all" });
    expect(rows[0]).toHaveAttribute("data-active", "true");

    fireEvent.keyDown(picker, { key: "ArrowUp" });
    expect(showAll).toHaveAttribute("data-active", "true");
    fireEvent.keyDown(picker, { key: " ", code: "Space" });
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith([]));

    fireEvent.keyDown(document, { key: "c" });
    const reopened = screen.getByRole("dialog", { name: "Choose commits" });
    const reopenedRows = reopened.querySelectorAll<HTMLElement>("[data-commit-index]");
    expect(reopenedRows[0]).toHaveAttribute("data-active", "true");
    fireEvent.keyDown(reopened, { key: " ", code: "Space" });
    const showSelected = within(reopened).getByRole("button", { name: "Show (1)" });
    expect(showSelected).toBeEnabled();
    for (let index = 0; index < source.commits.length; index += 1) {
      fireEvent.keyDown(reopened, { key: index % 2 === 0 ? "j" : "ArrowDown" });
    }
    expect(showSelected).toHaveAttribute("data-active", "true");

    fireEvent.keyDown(reopened, { key: "Enter" });
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith([source.commits[0]!.id]));
    expect(screen.queryByRole("dialog", { name: "Choose commits" })).not.toBeInTheDocument();
  });

  it("steps from the virtual commit through commits and back with buttons", async () => {
    const { backend, user } = setup();
    await screen.findByText("5 commits against origin/main");

    await user.click(screen.getByRole("button", { name: "Show latest commit Uncommitted changes" }));
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith(["WORKTREE"]));
  });

  it("steps through commits with Right or L and returns with Left or H", async () => {
    const source = fixture as ReviewData;
    let current = { ...source, selectedCommitIds: [] as string[] };
    const backend: ReviewBackend = {
      getReview: vi.fn().mockImplementation(async () => current),
      selectCommits: vi.fn().mockImplementation(async (selectedCommitIds: string[]) => {
        current = { ...source, selectedCommitIds };
        return current;
      }),
      finishReview: vi.fn(),
      cancelReview: vi.fn(),
    };
    render(<ReviewApp backend={backend} />);
    await screen.findByText("5 commits against origin/main");

    fireEvent.keyDown(document, { key: "ArrowRight" });
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith(["WORKTREE"]));
    fireEvent.keyDown(document, { key: "l" });
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith([source.commit.id]));
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith(["WORKTREE"]));
    fireEvent.keyDown(document, { key: "h" });
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith([]));
  });

  it("jumps to a selected file vertically without scrolling the app sideways", async () => {
    const { user } = setup();
    await screen.findByText("5 commits against origin/main");
    const pane = screen.getByRole("main", { name: "Commit diff" });
    const file = document.getElementById("file-f1")!;
    const scrollTo = vi.fn();
    pane.scrollTo = scrollTo;
    pane.scrollTop = 120;
    pane.getBoundingClientRect = vi.fn(() => ({ top: 80 }) as DOMRect);
    file.getBoundingClientRect = vi.fn(() => ({ top: 460 }) as DOMRect);

    await user.click(screen.getByTitle("tests/rendering/reference.png"));

    expect(scrollTo).toHaveBeenCalledWith({ top: 488, behavior: "smooth" });
    expect(scrollTo.mock.calls[0]![0]).not.toHaveProperty("left");
  });

  it("steps between files with arrows or J and K while Space continues to page", async () => {
    setup();
    await screen.findByText("5 commits against origin/main");
    const pane = screen.getByRole("main", { name: "Commit diff" });
    const first = screen.getByTitle("engine/GraphicsPage.cpp");
    const second = screen.getByTitle("tests/rendering/reference.png");
    const scrollTo = vi.fn();
    const scrollBy = vi.fn();
    pane.scrollTo = scrollTo;
    pane.scrollBy = scrollBy;
    Object.defineProperty(pane, "clientHeight", { configurable: true, value: 600 });

    expect(first).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(second).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(first).toHaveAttribute("aria-current", "true");
    const help = screen.getByRole("button", { name: "Show keyboard shortcuts" });
    help.focus();
    fireEvent.keyDown(help, { key: "j" });
    expect(second).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(help, { key: "k" });
    expect(first).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(document, { key: " ", code: "Space" });
    expect(scrollBy).toHaveBeenCalledWith({ top: 552, behavior: "smooth" });
    fireEvent.keyDown(document, { key: " ", code: "Space", shiftKey: true });
    expect(scrollBy).toHaveBeenCalledWith({ top: -552, behavior: "smooth" });
  });

  it("shows a compact expandable message for the resolved context", async () => {
    const source = fixture as ReviewData;
    const data = { ...source, selectedCommitIds: [source.commit.id] };
    const backend: ReviewBackend = {
      getReview: vi.fn().mockResolvedValue(data),
      selectCommits: vi.fn(),
      finishReview: vi.fn(),
      cancelReview: vi.fn(),
    };
    const user = userEvent.setup();
    render(<ReviewApp backend={backend} />);
    await screen.findByText(source.commit.summary);
    const panel = screen.getByRole("region", { name: "Commit message" });
    expect(panel).toHaveTextContent("Add localized labels for every graphics quality setting");
    expect(panel.querySelector("code")).toBeNull();
    const expand = within(panel).getByRole("button", { name: "Expand commit message" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    await user.click(expand);
    expect(within(panel).getByRole("button", { name: "Collapse commit message" })).toHaveAttribute("aria-expanded", "true");
  });

  it("uses the virtual context and disables stepping for aggregate selections", async () => {
    const source = fixture as ReviewData;
    const data = { ...source, selectedCommitIds: [source.commits[1]!.id, source.commits[2]!.id] };
    const backend: ReviewBackend = {
      getReview: vi.fn().mockResolvedValue(data),
      selectCommits: vi.fn(),
      finishReview: vi.fn(),
      cancelReview: vi.fn(),
    };
    render(<ReviewApp backend={backend} />);
    await screen.findByText("2 selected commits");
    const message = screen.getByRole("region", { name: "Commit message" });
    expect(message).toHaveTextContent("Virtual commit.");
    expect(message.querySelector("code")).toBeNull();
    expect(screen.getByRole("button", { name: "No newer commit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No older commit" })).toBeDisabled();
  });

  it("shows and selects the working-tree commit with the shared identity", async () => {
    const { backend, user } = setup();
    await screen.findByText("5 commits against origin/main");
    await user.click(screen.getByTitle("Choose commits to review"));
    const picker = screen.getByRole("dialog", { name: "Choose commits" });
    expect(within(picker).getByText("Uncommitted changes")).toBeInTheDocument();
    expect(picker).toHaveTextContent("worktree by Local working tree");
    expect(within(picker).queryByText("Virtual")).not.toBeInTheDocument();
    await user.click(within(picker).getByRole("button", { name: "Show only Uncommitted changes" }));
    await waitFor(() => expect(backend.selectCommits).toHaveBeenLastCalledWith(["WORKTREE"]));
  });

  it("expands and collapses a full multiline commit message", async () => {
    const { user } = setup();
    await screen.findByText("5 commits against origin/main");
    await user.click(screen.getByTitle("Choose commits to review"));
    const picker = screen.getByRole("dialog", { name: "Choose commits" });
    const expand = within(picker).getByRole("button", { name: "Show full message for Improve graphics options" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(within(picker).queryByText(/Add localized labels for every graphics quality setting/)).not.toBeInTheDocument();

    await user.click(expand);
    expect(within(picker).getByText(/Add localized labels for every graphics quality setting/)).toBeInTheDocument();
    expect(within(picker).getByText(/Keep the fallback text aligned/)).toBeInTheDocument();
    expect(within(picker).getByRole("button", { name: "Hide full message for Improve graphics options" })).toHaveAttribute("aria-expanded", "true");

    await user.click(within(picker).getByRole("button", { name: "Hide full message for Improve graphics options" }));
    expect(within(picker).queryByText(/Add localized labels for every graphics quality setting/)).not.toBeInTheDocument();
    expect(within(picker).queryAllByTitle("Full commit message")).toHaveLength(2);
  });

  it("dismisses the commit picker with Escape without closing the app", async () => {
    const { backend, user } = setup();
    await screen.findByText("5 commits against origin/main");
    await user.click(screen.getByTitle("Choose commits to review"));
    expect(screen.getByRole("dialog", { name: "Choose commits" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Choose commits" })).not.toBeInTheDocument();
    expect(backend.cancelReview).not.toHaveBeenCalled();
  });

  it("opens shortcut help with question mark and dismisses it before closing the app", async () => {
    const { backend, user } = setup();
    await screen.findByText("5 commits against origin/main");

    fireEvent.keyDown(document, { key: "?", shiftKey: true });
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Jump to the next file or commit")).toBeInTheDocument();
    expect(within(dialog).getByText("Approve or share queued comments")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
    expect(backend.cancelReview).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Show keyboard shortcuts" }));
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("does not open shortcut help while typing a question mark", async () => {
    const { user } = setup();
    await screen.findByText("5 commits against origin/main");
    const filter = screen.getByRole("searchbox", { name: "Filter files" });
    await user.type(filter, "?");
    expect(filter).toHaveValue("?");
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
  });

  it("labels file diffs with their source commit only for multi-commit selections", async () => {
    const sourceCommit = (fixture as ReviewData).commits[1]!;
    const selected = {
      ...(fixture as ReviewData),
      selectedCommitIds: [sourceCommit.id, (fixture as ReviewData).commits[2]!.id],
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
    expect(within(screen.getByRole("main", { name: "Commit diff" })).getAllByText(sourceCommit.shortId)).toHaveLength(1);
    expect(screen.getByTitle(`${sourceCommit.shortId} · ${sourceCommit.summary}`)).toBeInTheDocument();
  });

  it("omits redundant source commits for an individual commit", async () => {
    const source = fixture as ReviewData;
    const sourceCommit = source.commits[1]!;
    const selected = {
      ...source,
      selectedCommitIds: [sourceCommit.id],
      files: source.files.map((file) => ({ ...file, sourceCommit })),
    };
    const backend: ReviewBackend = {
      getReview: vi.fn().mockResolvedValue(selected),
      selectCommits: vi.fn(),
      finishReview: vi.fn(),
      cancelReview: vi.fn(),
    };
    render(<ReviewApp backend={backend} />);
    await screen.findByTitle("Choose commits to review");

    expect(screen.queryByTitle(`${sourceCommit.shortId} · ${sourceCommit.summary}`)).not.toBeInTheDocument();
    expect(screen.getByTitle("engine/GraphicsPage.cpp")).toBeInTheDocument();
  });

  it("filters files and collapses directories", async () => {
    const { user } = setup();
    await screen.findByText("5 commits against origin/main");
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
    await screen.findByText("5 commits against origin/main");
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
    await screen.findByText("5 commits against origin/main");
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
    await screen.findByText("5 commits against origin/main");
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
    await screen.findByText("5 commits against origin/main");
    fireEvent.keyDown(document, "key" in shortcut ? shortcut : { key: "Escape" });
    await waitFor(() => expect(backend.cancelReview).toHaveBeenCalledOnce());
  });

  it("creates, edits, and shares a line comment", async () => {
    const { user, submissions } = setup();
    await screen.findByText("5 commits against origin/main");
    expect(screen.getByRole("button", { name: "Share comments (0)" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp R26/ }));
    const editor = screen.getByRole("group", { name: "Comment on R26" });
    await user.type(within(editor).getByRole("textbox", { name: "Review comment" }), "Please explain this.");
    await user.click(within(editor).getByRole("button", { name: "Save comment" }));
    expect(screen.getByText("Please explain this.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Share comments (1)" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const edited = screen.getByRole("textbox", { name: "Review comment" });
    await user.clear(edited);
    await user.type(edited, "Use a named constant.");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await user.click(screen.getByRole("button", { name: "Share comments (1)" }));
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toEqual({ outcome: "share", comments: [{ fileId: "f0", lineId: "f0:h0:l2", body: "Use a named constant." }] });
  });

  it("updates the queued-comment count as drafts are added and removed", async () => {
    const { user } = setup();
    await screen.findByText("5 commits against origin/main");
    await user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp R26/ }));
    await user.type(screen.getByRole("textbox", { name: "Review comment" }), "First note.");
    await user.click(screen.getByRole("button", { name: "Save comment" }));
    expect(screen.getByRole("button", { name: "Share comments (1)" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp R27/ }));
    await user.type(screen.getByRole("textbox", { name: "Review comment" }), "Second note.");
    await user.click(screen.getByRole("button", { name: "Save comment" }));
    expect(screen.getByRole("button", { name: "Share comments (2)" })).toBeEnabled();

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(screen.getByRole("button", { name: "Share comments (1)" })).toBeEnabled();
  });

  it("approves when no drafts exist", async () => {
    const { user, submissions } = setup();
    await screen.findByText("5 commits against origin/main");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(submissions[0]).toEqual({ outcome: "approve", comments: [] }));
  });

  it("reflects clipboard mode in the action labels and mouse action", async () => {
    const { backend, user } = setup();
    await screen.findByText("5 commits against origin/main");

    await user.keyboard("{Control>}{Alt>}");
    const approve = await screen.findByRole("button", { name: "Approve and copy" });
    expect(approve).toHaveAttribute("title", "Ctrl/Cmd + Alt + Enter");
    expect(screen.getByRole("button", { name: "Share and copy (0)" })).toBeDisabled();

    await user.keyboard("{/Alt}{/Control}");
    expect(await screen.findByRole("button", { name: "Approve" })).toHaveAttribute("title", "Ctrl/Cmd + Enter");

    await user.keyboard("{Control>}{Alt>}");
    fireEvent.blur(window);
    expect(await screen.findByRole("button", { name: "Approve" })).toBeEnabled();

    await user.keyboard("{/Alt}{/Control}{Control>}{Alt>}");
    await user.click(await screen.findByRole("button", { name: "Approve and copy" }));
    await waitFor(() => expect(backend.finishReview).toHaveBeenCalledWith({
      outcome: "approve",
      comments: [],
    }, true));
  });

  it("runs the context-sensitive primary action with Control+Enter", async () => {
    const first = setup();
    await screen.findByText("5 commits against origin/main");
    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(first.submissions[0]).toEqual({ outcome: "approve", comments: [] }));

    cleanup();
    const second = setup();
    await screen.findByText("5 commits against origin/main");
    await second.user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp R26/ }));
    await second.user.type(screen.getByRole("textbox", { name: "Review comment" }), "Please reconsider this.");
    await second.user.click(screen.getByRole("button", { name: "Save comment" }));
    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(second.submissions[0]).toEqual({
      outcome: "share",
      comments: [{ fileId: "f0", lineId: "f0:h0:l2", body: "Please reconsider this." }],
    }));
  });

  it("runs the primary action and requests clipboard copying with Control+Alt+Enter", async () => {
    const first = setup();
    await screen.findByText("5 commits against origin/main");

    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true, altKey: true });

    await waitFor(() => expect(first.backend.finishReview).toHaveBeenCalledWith({
      outcome: "approve",
      comments: [],
    }, true));

    cleanup();
    const second = setup();
    await screen.findByText("5 commits against origin/main");
    await second.user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp R26/ }));
    await second.user.type(screen.getByRole("textbox", { name: "Review comment" }), "Copy this review.");
    await second.user.click(screen.getByRole("button", { name: "Save comment" }));
    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true, altKey: true });

    await waitFor(() => expect(second.backend.finishReview).toHaveBeenCalledWith({
      outcome: "share",
      comments: [{ fileId: "f0", lineId: "f0:h0:l2", body: "Copy this review." }],
    }, true));
  });

  it("uses Control+Enter to save an open editor without submitting the review", async () => {
    const { submissions, user } = setup();
    await screen.findByText("5 commits against origin/main");
    await user.click(screen.getByRole("button", { name: /Add comment on engine\/GraphicsPage\.cpp R26/ }));
    const editor = screen.getByRole("textbox", { name: "Review comment" });
    await user.type(editor, "Draft only.");
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Review comment" })).not.toBeInTheDocument());
    expect(screen.getByText("Draft only.")).toBeInTheDocument();
    expect(submissions).toHaveLength(0);
  });

  it("pages the diff with Space and Shift+Space without stealing interactive input", async () => {
    const { user } = setup();
    await screen.findByText("5 commits against origin/main");
    const pane = screen.getByRole("main", { name: "Commit diff" });
    const scrollBy = vi.fn();
    pane.scrollBy = scrollBy;
    Object.defineProperty(pane, "clientHeight", { configurable: true, value: 600 });

    fireEvent.keyDown(document, { key: " ", code: "Space" });
    expect(scrollBy).toHaveBeenLastCalledWith({ top: 552, behavior: "smooth" });
    fireEvent.keyDown(document, { key: " ", code: "Space", shiftKey: true });
    expect(scrollBy).toHaveBeenLastCalledWith({ top: -552, behavior: "smooth" });

    const filter = screen.getByRole("searchbox", { name: "Filter files" });
    await user.click(filter);
    fireEvent.keyDown(filter, { key: " ", code: "Space" });
    expect(scrollBy).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(filter, { key: "j" });
    expect(screen.getByTitle("engine/GraphicsPage.cpp")).toHaveAttribute("aria-current", "true");

    const help = screen.getByRole("button", { name: "Show keyboard shortcuts" });
    await user.click(help);
    fireEvent.keyDown(help, { key: "Escape" });
    help.focus();
    fireEvent.keyDown(help, { key: " ", code: "Space" });
    expect(scrollBy).toHaveBeenCalledTimes(3);

    await user.click(screen.getByTitle("Choose commits to review"));
    fireEvent.keyDown(document, { key: " ", code: "Space" });
    expect(scrollBy).toHaveBeenCalledTimes(3);
  });

  it("finds code with native shortcuts and navigates matches", async () => {
    const { backend, user } = setup();
    await screen.findByText("5 commits against origin/main");
    const firstFile = screen.getByRole("button", { name: /^engine\/GraphicsPage\.cpp$/ });
    await user.click(firstFile);
    expect(firstFile).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(document, { key: "f", ctrlKey: true });
    const input = await screen.findByRole("searchbox", { name: "Find in code" });
    expect(input).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Type to search");
    await user.type(input, "const");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 of 3"));
    expect(firstFile).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector('[data-search-match="0"]')).toHaveClass(/activeMatch/);

    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 of 3"));
    fireEvent.keyDown(document, { key: "F3" });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("3 of 3"));
    fireEvent.keyDown(document, { key: "g", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 of 3"));

    await user.clear(input);
    await user.type(input, "not present");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No results"));
    expect(screen.getByRole("button", { name: "Previous match" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next match" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("search", { name: "Find in diff" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-search-match]")).not.toBeInTheDocument();
    expect(backend.cancelReview).not.toHaveBeenCalled();
  });

  it.each([
    ["Command+F", { key: "f", metaKey: true }],
    ["F3", { key: "F3" }],
  ])("opens find with %s", async (_name, shortcut) => {
    setup();
    await screen.findByText("5 commits against origin/main");
    fireEvent.keyDown(document, shortcut);
    expect(await screen.findByRole("searchbox", { name: "Find in code" })).toHaveFocus();
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
    await screen.findByText("5 commits against origin/main");
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
