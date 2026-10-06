import { commitContext, commitNavigationTarget } from "../commitPresentation";
import type { ReviewData } from "../types";
import { shortcutDefinition, shortcutTitle, type ShortcutId } from "../shortcuts";

export type WindowChromeKind = "gtk-native" | "mac-native" | "windows-native" | "html";
export type WindowChromeAction = "sidebar" | "help" | "picker" | "newer" | "older";

export interface WindowChromeUpdate {
  title: string;
  subtitle: string;
  canNavigateNewer: boolean;
  canNavigateOlder: boolean;
  commitSelectionEnabled: boolean;
  tooltips: Record<WindowChromeAction, string>;
}

export function hasNativeHeader(kind: WindowChromeKind): boolean {
  return kind === "gtk-native" || kind === "mac-native";
}

export function windowChromeUpdate(data: ReviewData, disabled: boolean): WindowChromeUpdate {
  const context = commitContext(data);
  return {
    title: context?.title ?? "No commits to review",
    subtitle: context ? `${context.ref} by ${context.authors}` : `${data.comparison.baseRef}...HEAD`,
    canNavigateNewer: !disabled && commitNavigationTarget(data, "newer") !== null,
    canNavigateOlder: !disabled && commitNavigationTarget(data, "older") !== null,
    commitSelectionEnabled: !disabled,
    tooltips: windowChromeTooltips(),
  };
}

export function windowChromeTooltips(): Record<WindowChromeAction, string> {
  const tooltip = (id: ShortcutId) => `${shortcutDefinition(id).description} (${shortcutTitle(id)})`;
  return {
    sidebar: tooltip("toggleSidebar"),
    help: tooltip("help"),
    picker: tooltip("browseCommits"),
    newer: tooltip("newerCommit"),
    older: tooltip("olderCommit"),
  };
}
