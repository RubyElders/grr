import { fireEvent, render, screen } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WindowTitlebar } from "./WindowTitlebar";

const windowApi = vi.hoisted(() => ({
  minimize: vi.fn().mockResolvedValue(undefined),
  startDragging: vi.fn().mockResolvedValue(undefined),
  toggleMaximize: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => windowApi }));

describe("WindowTitlebar", () => {
  it("routes titlebar controls and blank-area dragging", async () => {
    const onToggleSidebar = vi.fn();
    const onHelp = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <WindowTitlebar sidebarOpen onToggleSidebar={onToggleSidebar} onHelp={onHelp} onClose={onClose}>
        <button>Commit selector</button>
      </WindowTitlebar>,
    );

    await user.click(screen.getByRole("button", { name: "Hide file sidebar" }));
    await user.click(screen.getByRole("button", { name: "Show keyboard shortcuts" }));
    await user.click(screen.getByRole("button", { name: "Minimize window" }));
    await user.click(screen.getByRole("button", { name: "Maximize window" }));
    await user.click(screen.getByRole("button", { name: "Close window" }));
    expect(onToggleSidebar).toHaveBeenCalledOnce();
    expect(onHelp).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(windowApi.minimize).toHaveBeenCalledOnce();
    expect(windowApi.toggleMaximize).toHaveBeenCalledOnce();

    const titlebar = screen.getByRole("banner");
    fireEvent.mouseDown(titlebar, { button: 0, detail: 1 });
    expect(windowApi.startDragging).toHaveBeenCalledOnce();
    fireEvent.mouseDown(titlebar, { button: 0, detail: 2 });
    expect(windowApi.toggleMaximize).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Commit selector" }), { button: 0, detail: 1 });
    expect(windowApi.startDragging).toHaveBeenCalledOnce();
  });
});
