import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { commitContext, commitNavigationTarget } from "./commitPresentation";
import type { ReviewData } from "./types";

export type NativeHeaderAction = "sidebar" | "help" | "picker" | "newer" | "older";

interface NativeHeaderUpdate {
  title: string;
  subtitle: string;
  canNavigateNewer: boolean;
  canNavigateOlder: boolean;
  commitSelectionEnabled: boolean;
}

export function usesNativeHeader(): boolean {
  return isTauri();
}

export function nativeHeaderUpdate(data: ReviewData, disabled: boolean): NativeHeaderUpdate {
  const context = commitContext(data);
  return {
    title: context?.title ?? "No commits to review",
    subtitle: context ? `${context.ref} by ${context.authors}` : `${data.comparison.baseRef}...HEAD`,
    canNavigateNewer: !disabled && commitNavigationTarget(data, "newer") !== null,
    canNavigateOlder: !disabled && commitNavigationTarget(data, "older") !== null,
    commitSelectionEnabled: !disabled,
  };
}

export function updateNativeHeader(update: NativeHeaderUpdate): Promise<void> {
  return invoke("update_native_header", { update });
}

export function listenNativeHeaderActions(handler: (action: NativeHeaderAction) => void): Promise<UnlistenFn> {
  return listen<NativeHeaderAction>("native-header-action", (event) => handler(event.payload));
}
