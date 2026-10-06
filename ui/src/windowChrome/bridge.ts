import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { WindowChromeAction, WindowChromeKind, WindowChromeUpdate } from "./model";

export async function resolveWindowChrome(): Promise<WindowChromeKind> {
  if (!isTauri()) return "html";
  const kind = await invoke<unknown>("get_window_chrome");
  if (kind === "gtk-native" || kind === "mac-native" || kind === "windows-native" || kind === "html") return kind;
  throw new Error("Unknown window chrome mode");
}

export function updateWindowChrome(update: WindowChromeUpdate): Promise<void> {
  return invoke("update_window_chrome", { update });
}

export function showWindowMenu(): Promise<void> {
  return invoke("show_window_menu");
}

export function listenWindowChromeActions(handler: (action: WindowChromeAction) => void): Promise<UnlistenFn> {
  return listen<unknown>("window-chrome-action", ({ payload }) => {
    if (payload === "sidebar" || payload === "help" || payload === "picker" || payload === "newer" || payload === "older") {
      handler(payload);
    }
  });
}
