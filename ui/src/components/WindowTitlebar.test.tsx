import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { showWindowMenu } from "../windowChrome/bridge";
import { WindowTitlebar } from "./WindowTitlebar";
import { windowChromeCapabilities } from "../windowChrome/model";

const windowApi = vi.hoisted(() => ({
  minimize: vi.fn().mockResolvedValue(undefined),
  startDragging: vi.fn().mockResolvedValue(undefined),
  toggleMaximize: vi.fn().mockResolvedValue(undefined),
  isMaximized: vi.fn().mockResolvedValue(false),
  onResized: vi.fn().mockResolvedValue(() => undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => windowApi }));
vi.mock("../windowChrome/bridge", () => ({ showWindowMenu: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => vi.clearAllMocks());

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

  it("does not open the native window menu in HTML mode", () => {
    render(<WindowTitlebar onClose={vi.fn()} />);
    fireEvent.contextMenu(screen.getByRole("banner"));
    expect(showWindowMenu).not.toHaveBeenCalled();
    expect(windowApi.isMaximized).not.toHaveBeenCalled();
  });

  it("gates the system menu independently of caption buttons", () => {
    render(<WindowTitlebar capabilities={{ nativeHeader: false, customCaptionButtons: true, systemMenu: false }} onClose={vi.fn()} />);
    fireEvent.contextMenu(screen.getByRole("banner"));
    expect(showWindowMenu).not.toHaveBeenCalled();
    expect(windowApi.isMaximized).toHaveBeenCalledOnce();
  });

  it("uses Windows caption buttons that follow the maximized state", async () => {
    const onClose = vi.fn();
    const stop = vi.fn();
    windowApi.onResized.mockResolvedValueOnce(stop);
    const user = userEvent.setup();
    const view = render(<WindowTitlebar capabilities={windowChromeCapabilities("windows-native")} sidebarOpen onHelp={vi.fn()} onClose={onClose}><button>Commit selector</button></WindowTitlebar>);

    await user.click(screen.getByRole("button", { name: "Minimize window" }));
    await user.click(screen.getByRole("button", { name: "Maximize window" }));
    await user.click(screen.getByRole("button", { name: "Close window" }));
    expect(windowApi.minimize).toHaveBeenCalledOnce();
    expect(windowApi.toggleMaximize).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    windowApi.isMaximized.mockResolvedValueOnce(true);
    const resized = windowApi.onResized.mock.calls[0]![0] as () => void;
    act(() => resized());
    expect(await screen.findByRole("button", { name: "Restore window" })).toBeInTheDocument();

    view.unmount();
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });

  it("opens the native window menu from blank title bar space", () => {
    render(<WindowTitlebar capabilities={windowChromeCapabilities("windows-native")} onClose={vi.fn()}><button>Commit selector</button></WindowTitlebar>);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Commit selector" }));
    expect(showWindowMenu).not.toHaveBeenCalled();
    const event = fireEvent.contextMenu(screen.getByRole("banner"));
    expect(event).toBe(false);
    expect(showWindowMenu).toHaveBeenCalledOnce();
  });

  it("dims the Windows title bar while the window is inactive", () => {
    render(<WindowTitlebar capabilities={windowChromeCapabilities("windows-native")} onClose={vi.fn()} />);
    const titlebar = screen.getByRole("banner");
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(titlebar).toHaveAttribute("data-inactive", "true");
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(titlebar).not.toHaveAttribute("data-inactive");
  });
});
