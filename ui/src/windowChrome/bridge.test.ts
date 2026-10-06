import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { listenWindowChromeActions, resolveWindowChrome, showWindowMenu, updateWindowChrome } from "./bridge";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

describe("window chrome bridge", () => {
  it("uses HTML in a browser without invoking native commands", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    expect(await resolveWindowChrome()).toBe("html");
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(["gtk-native", "mac-native", "windows-native", "html"])("resolves %s from the backend", async (kind) => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue(kind);
    expect(await resolveWindowChrome()).toBe(kind);
    expect(invoke).toHaveBeenCalledWith("get_window_chrome");
  });

  it("rejects an unknown platform mode", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue("unknown");
    await expect(resolveWindowChrome()).rejects.toThrow("Unknown window chrome mode");
  });

  it("passes the header state to the shared command", async () => {
    const update = { title: "Review", subtitle: "abc", canNavigateNewer: false, canNavigateOlder: true, commitSelectionEnabled: true };
    await updateWindowChrome(update);
    expect(invoke).toHaveBeenCalledWith("update_window_chrome", { update });
  });

  it("opens the native window menu", async () => {
    await showWindowMenu();
    expect(invoke).toHaveBeenCalledWith("show_window_menu");
  });

  it("accepts only defined chrome actions", async () => {
    const handler = vi.fn();
    await listenWindowChromeActions(handler);
    const [event, receive] = vi.mocked(listen).mock.calls[0]!;
    expect(event).toBe("window-chrome-action");
    for (const payload of ["sidebar", "help", "picker", "newer", "older", "unknown", null, {}]) {
      receive({ event, id: 1, payload });
    }
    expect(handler.mock.calls).toEqual([["sidebar"], ["help"], ["picker"], ["newer"], ["older"]]);
  });
});
