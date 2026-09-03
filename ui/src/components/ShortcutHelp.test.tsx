import { render, screen, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SHORTCUTS } from "../shortcuts";
import { ShortcutHelp } from "./ShortcutHelp";

describe("ShortcutHelp", () => {
  it("renders every shortcut from the shared registry", () => {
    render(<ShortcutHelp onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    for (const shortcut of SHORTCUTS) {
      expect(within(dialog).getByText(shortcut.description)).toBeInTheDocument();
      for (const chord of shortcut.chords) {
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
