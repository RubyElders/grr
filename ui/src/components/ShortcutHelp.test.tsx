import { render, screen, waitFor, within } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { invoke, isTauri } = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri }));

import { SHORTCUTS, shortcutChords } from "../shortcuts";
import { ShortcutHelp } from "./ShortcutHelp";

describe("ShortcutHelp", () => {
  beforeEach(() => {
    invoke.mockReset();
    isTauri.mockReturnValue(false);
  });
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

  it("switches About and shortcuts with clicks and arrow keys", async () => {
    const user = userEvent.setup();
    render(<ShortcutHelp onClose={vi.fn()} />);
    const about = screen.getByRole("tab", { name: "About grr" });
    await user.click(about);
    expect(about).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "About grr" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeDisabled();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Keyboard shortcuts" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Keyboard shortcuts" })).toBeVisible();
    await user.keyboard("{ArrowRight}");
    expect(about).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Keyboard shortcuts" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(about).toHaveFocus();
    expect(about).toHaveAttribute("aria-selected", "true");
  });

  it("separates alternatives from keys pressed together", () => {
    render(<ShortcutHelp onClose={vi.fn()} />);
    const row = screen.getByText("Show the newer commit or virtual commit").parentElement!;
    expect(within(row).getByText("or")).toBeInTheDocument();
    expect(row.querySelectorAll("kbd")).toHaveLength(2);
    const combined = screen.getByText("Approve or share and copy the result").parentElement!;
    expect(combined.querySelectorAll("kbd")).toHaveLength(1);
    expect(within(combined).queryByText("or")).not.toBeInTheDocument();
  });

  it("shows the update stub and builder website", async () => {
    const user = userEvent.setup();
    render(<ShortcutHelp onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /grr v/ })).toBeInTheDocument();
    expect(screen.getByText("Git Robust Review")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "About grr" }));
    expect(screen.getByText("Not available yet")).toBeInTheDocument();
    expect(screen.getByText("Update checking is not available in this version.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Ruby Elders" });
    expect(link).toHaveAttribute("href", "https://rubyelders.com");
    await user.click(link);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("opens the builder website through the desktop command and reports failures", async () => {
    isTauri.mockReturnValue(true);
    invoke.mockRejectedValueOnce(new Error("no browser")).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<ShortcutHelp onClose={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "About grr" }));
    const link = screen.getByRole("link", { name: "Ruby Elders" });
    await user.click(link);
    expect(invoke).toHaveBeenCalledWith("open_author_website");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open the browser");
    await user.click(link);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
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
