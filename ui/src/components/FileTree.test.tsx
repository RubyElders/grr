import { render, screen, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import fixture from "../__fixtures__/review.json";
import type { ReviewData } from "../types";
import { FileTree } from "./FileTree";

describe("FileTree scrolling", () => {
  it.each([
    { selected: "first", height: 300, expectedTop: 0 },
    { selected: "first", height: 100, expectedTop: 200 },
    { selected: "last", height: 300, expectedTop: 200 },
  ])("positions $selected with a $height pixel viewport", async ({ selected, height, expectedTop }) => {
    const file = (fixture as ReviewData).files[0]!;
    const files = [
      { ...file, id: "last", displayPath: "z.txt" },
      { ...file, id: "first", displayPath: "src/nested/a.txt" },
    ];
    const props = {
      files, totalFileCount: files.length, showSourceCommits: false, filter: "",
      collapsedDirectories: new Set<string>(), onFilter: vi.fn(),
      onToggleDirectory: vi.fn(), onSelectFile: vi.fn(),
    };
    const view = render(<FileTree {...props} activeFileId={null} />);
    const sidebar = screen.getByRole("complementary", { name: "Changed files" });
    const active = screen.getByTitle(selected === "first" ? "src/nested/a.txt" : "z.txt");
    const scrollIntoView = vi.fn();
    active.scrollIntoView = scrollIntoView;
    sidebar.scrollTop = 200;
    sidebar.scrollLeft = 25;
    Object.defineProperty(sidebar, "clientHeight", { configurable: true, value: height });
    sidebar.getBoundingClientRect = () => ({ top: 50 }) as DOMRect;
    active.getBoundingClientRect = () => ({ bottom: 30 }) as DOMRect;

    view.rerender(<FileTree {...props} activeFileId={selected} />);

    await waitFor(() => {
      expect(sidebar.scrollTop).toBe(expectedTop);
      if (expectedTop === 0) expect(scrollIntoView).not.toHaveBeenCalled();
      else expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    });
    expect(sidebar.scrollLeft).toBe(25);
  });
});
