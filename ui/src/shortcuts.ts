export type ShortcutId =
  | "help"
  | "toggleSidebar"
  | "find"
  | "nextMatch"
  | "previousMatch"
  | "browseCommits"
  | "showHighlightedCommit"
  | "toggleHighlightedCommit"
  | "newerCommit"
  | "olderCommit"
  | "previousFile"
  | "nextFile"
  | "pageUp"
  | "pageDown"
  | "primaryAction"
  | "copyPrimaryAction"
  | "saveComment"
  | "dismiss"
  | "closeWindow";

export type ShortcutCategory = "Review" | "Navigation" | "Search" | "Window";

interface ShortcutChord {
  id: string;
  key: string;
  code?: string;
  nativeModifier?: boolean;
  alt?: boolean;
  shift?: boolean | "any";
}

export interface ShortcutDefinition {
  id: ShortcutId;
  category: ShortcutCategory;
  description: string;
  chords: readonly ShortcutChord[];
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  shortcut("help", "Window", "Show keyboard shortcuts", [chord("question", "?", { shift: "any" })]),
  shortcut("toggleSidebar", "Window", "Toggle the file sidebar", [chord("native", "b", { nativeModifier: true })]),
  shortcut("find", "Search", "Open find in changed code", [
    chord("native", "f", { nativeModifier: true }),
    chord("function", "F3"),
  ]),
  shortcut("nextMatch", "Search", "Go to the next search match", [
    chord("enter", "Enter"),
    chord("function", "F3"),
    chord("native", "g", { nativeModifier: true }),
  ]),
  shortcut("previousMatch", "Search", "Go to the previous search match", [
    chord("enter", "Enter", { shift: true }),
    chord("function", "F3", { shift: true }),
    chord("native", "g", { nativeModifier: true, shift: true }),
  ]),
  shortcut("browseCommits", "Navigation", "Browse commits", [chord("letter", "c")]),
  shortcut("showHighlightedCommit", "Navigation", "Show the highlighted commit", [chord("enter", "Enter")]),
  shortcut("toggleHighlightedCommit", "Navigation", "Toggle the highlighted commit", [chord("space", " ", { code: "Space" })]),
  shortcut("newerCommit", "Navigation", "Show the newer commit or virtual commit", [
    chord("arrow", "ArrowLeft"),
    chord("vim", "h"),
  ]),
  shortcut("olderCommit", "Navigation", "Show the older commit or latest commit", [
    chord("arrow", "ArrowRight"),
    chord("vim", "l"),
  ]),
  shortcut("previousFile", "Navigation", "Jump to the previous file or commit", [
    chord("arrow", "ArrowUp"),
    chord("vim", "k"),
  ]),
  shortcut("nextFile", "Navigation", "Jump to the next file or commit", [
    chord("arrow", "ArrowDown"),
    chord("vim", "j"),
  ]),
  shortcut("pageUp", "Navigation", "Page the diff up", [chord("space", " ", { code: "Space", shift: true })]),
  shortcut("pageDown", "Navigation", "Page the diff down", [chord("space", " ", { code: "Space" })]),
  shortcut("primaryAction", "Review", "Approve or share queued comments", [chord("native", "Enter", { nativeModifier: true })]),
  shortcut("copyPrimaryAction", "Review", "Approve or share and copy the result", [
    chord("native", "Enter", { nativeModifier: true, alt: true }),
  ]),
  shortcut("saveComment", "Review", "Save the open inline comment", [chord("native", "Enter", { nativeModifier: true })]),
  shortcut("dismiss", "Window", "Close the open panel or cancel the review", [chord("escape", "Escape")]),
  shortcut("closeWindow", "Window", "Cancel the review and close the window", [
    chord("native", "w", { nativeModifier: true }),
    chord("alt", "F4", { alt: true }),
  ]),
];

export const SHORTCUT_CATEGORIES: readonly ShortcutCategory[] = ["Review", "Navigation", "Search", "Window"];

export function shortcutDefinition(id: ShortcutId): ShortcutDefinition {
  const definition = SHORTCUTS.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown shortcut: ${id}`);
  return definition;
}

export function shortcutChords(id: ShortcutId, mac = /Mac/.test(navigator.platform)) {
  return availableChords(id, mac)
    .map((item) => {
      const key = ({ " ": "Space", ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down" } as Record<string, string>)[item.key]
        ?? (item.nativeModifier && item.key.length === 1 ? item.key.toUpperCase() : item.key);
      const label = [item.nativeModifier ? (mac ? "Command" : "Ctrl") : null, item.alt ? (mac ? "Option" : "Alt") : null, item.shift === true ? "Shift" : null, key].filter(Boolean).join(" + ");
      const symbols: Record<string, string> = {
        Enter: "↩", Escape: "⎋", Left: "←", Right: "→", Up: "↑", Down: "↓", Space: "␣",
      };
      const display = mac
        ? `${item.alt ? "⌥" : ""}${item.shift === true ? "⇧" : ""}${item.nativeModifier ? "⌘" : ""}${symbols[key] ?? key}`
        : label;
      return { id: item.id, display, label };
    });
}

export function shortcutTitle(id: ShortcutId, mac = /Mac/.test(navigator.platform)): string {
  return shortcutChords(id, mac).map((item) => item.display).join(" or ");
}

export function matchesShortcut(event: ShortcutEvent, id: ShortcutId, chordId?: string): boolean {
  return availableChords(id).some((item) => (
    (chordId === undefined || item.id === chordId)
    && matchesChord(event, item)
  ));
}

export function shortcutModifiersActive(event: ShortcutEvent, id: ShortcutId, chordId?: string): boolean {
  return availableChords(id).some((item) => (
    (chordId === undefined || item.id === chordId)
    && matchesModifiers(event, item)
  ));
}

interface ShortcutEvent {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function availableChords(id: ShortcutId, mac = /Mac/.test(navigator.platform)) {
  return shortcutDefinition(id).chords.filter((item) => !mac || !(id === "closeWindow" && item.id === "alt"));
}

function matchesChord(event: ShortcutEvent, item: ShortcutChord): boolean {
  const keyMatches = item.key.length === 1
    ? event.key.toLowerCase() === item.key.toLowerCase()
    : event.key === item.key;
  if (!keyMatches || (item.code && event.code !== item.code)) return false;
  return matchesModifiers(event, item);
}

function matchesModifiers(event: ShortcutEvent, item: ShortcutChord): boolean {
  const mac = /Mac/.test(navigator.platform);
  if ((mac ? event.metaKey : event.ctrlKey) !== Boolean(item.nativeModifier)) return false;
  if (mac ? event.ctrlKey : event.metaKey) return false;
  if (event.altKey !== Boolean(item.alt)) return false;
  return item.shift === "any" || event.shiftKey === Boolean(item.shift);
}

function shortcut(
  id: ShortcutId,
  category: ShortcutCategory,
  description: string,
  chords: readonly ShortcutChord[],
): ShortcutDefinition {
  return { id, category, description, chords };
}

function chord(
  id: string,
  key: string,
  modifiers: Omit<ShortcutChord, "id" | "key"> = {},
): ShortcutChord {
  return { id, key, ...modifiers };
}
