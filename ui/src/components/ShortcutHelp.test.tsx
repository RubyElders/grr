import { render, screen, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SHORTCUTS, shortcutChords } from "../shortcuts";
import { ShortcutHelp } from "./ShortcutHelp";

describe("ShortcutHelp", () => {
  it("shows native Mac notation with readable accessibility labels", () => {
    const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    try {
      render(<ShortcutHelp onClose={vi.fn()} />);
      expect(screen.getAllByText("⌘↩")).toHaveLength(2);
      expect(screen.getByText("⌥⌘↩")).toHaveAttribute("aria-label", "Command + Option + Enter");
      expect(screen.getByText("⌘W")).toBeInTheDocument();
      expect(screen.queryByText("Alt + F4")).not.toBeInTheDocument();
    } finally {
      platform.mockRestore();
    }
  });

  it("renders every shortcut from the shared registry", () => {
    render(<ShortcutHelp onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    for (const shortcut of SHORTCUTS) {
      expect(within(dialog).getByText(shortcut.description)).toBeInTheDocument();
      for (const chord of shortcutChords(shortcut.id)) {
        expect(within(dialog).getAllByText(chord.display).length).toBeGreaterThan(0);
      }
    }
  });

  it("focuses and activates its close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ShortcutHelp onClose={onClose} />);
    const close = screen.getByRole("button", { name: "Close keyboard shortcuts" });
    expect(close).toHaveFocus();
    await user.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
