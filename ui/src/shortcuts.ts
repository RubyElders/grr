export type ShortcutId =
  | "help"
  | "find"
  | "nextMatch"
  | "previousMatch"
  | "newerCommit"
  | "olderCommit"
  | "previousFile"
  | "nextFile"
  | "pageUp"
  | "pageDown"
  | "primaryAction"
  | "saveComment"
  | "dismiss"
  | "closeWindow";

export type ShortcutCategory = "Review" | "Navigation" | "Search" | "Window";

interface ShortcutChord {
  id: string;
  display: string;
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
  shortcut("help", "Window", "Show keyboard shortcuts", [chord("question", "?", "?", { shift: "any" })]),
  shortcut("find", "Search", "Open find in changed code", [
    chord("native", "Ctrl/Cmd + F", "f", { nativeModifier: true }),
    chord("function", "F3", "F3"),
  ]),
  shortcut("nextMatch", "Search", "Go to the next search match", [
    chord("enter", "Enter", "Enter"),
    chord("function", "F3", "F3"),
    chord("native", "Ctrl/Cmd + G", "g", { nativeModifier: true }),
  ]),
  shortcut("previousMatch", "Search", "Go to the previous search match", [
    chord("enter", "Shift + Enter", "Enter", { shift: true }),
    chord("function", "Shift + F3", "F3", { shift: true }),
    chord("native", "Ctrl/Cmd + Shift + G", "g", { nativeModifier: true, shift: true }),
  ]),
  shortcut("newerCommit", "Navigation", "Show the newer commit or virtual commit", [
    chord("arrow", "Left", "ArrowLeft"),
    chord("vim", "H", "h"),
  ]),
  shortcut("olderCommit", "Navigation", "Show the older commit or latest commit", [
    chord("arrow", "Right", "ArrowRight"),
    chord("vim", "L", "l"),
  ]),
  shortcut("previousFile", "Navigation", "Jump to the previous changed file", [
    chord("arrow", "Up", "ArrowUp"),
    chord("vim", "K", "k"),
  ]),
  shortcut("nextFile", "Navigation", "Jump to the next changed file", [
    chord("arrow", "Down", "ArrowDown"),
    chord("vim", "J", "j"),
  ]),
  shortcut("pageUp", "Navigation", "Page the diff up", [chord("space", "Shift + Space", " ", { code: "Space", shift: true })]),
  shortcut("pageDown", "Navigation", "Page the diff down", [chord("space", "Space", " ", { code: "Space" })]),
  shortcut("primaryAction", "Review", "Approve or share queued comments", [chord("native", "Ctrl/Cmd + Enter", "Enter", { nativeModifier: true })]),
  shortcut("saveComment", "Review", "Save the open inline comment", [chord("native", "Ctrl/Cmd + Enter", "Enter", { nativeModifier: true })]),
  shortcut("dismiss", "Window", "Close the open panel or cancel the review", [chord("escape", "Escape", "Escape")]),
  shortcut("closeWindow", "Window", "Cancel the review and close the window", [
    chord("native", "Ctrl/Cmd + W", "w", { nativeModifier: true }),
    chord("alt", "Alt + F4", "F4", { alt: true }),
  ]),
];

export const SHORTCUT_CATEGORIES: readonly ShortcutCategory[] = ["Review", "Navigation", "Search", "Window"];

export function shortcutDefinition(id: ShortcutId): ShortcutDefinition {
  const definition = SHORTCUTS.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown shortcut: ${id}`);
  return definition;
}

export function shortcutTitle(id: ShortcutId): string {
  return shortcutDefinition(id).chords.map((item) => item.display).join(" or ");
}

export function matchesShortcut(event: ShortcutEvent, id: ShortcutId, chordId?: string): boolean {
  return shortcutDefinition(id).chords.some((item) => (
    (chordId === undefined || item.id === chordId)
    && matchesChord(event, item)
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

function matchesChord(event: ShortcutEvent, item: ShortcutChord): boolean {
  const keyMatches = item.key.length === 1
    ? event.key.toLowerCase() === item.key.toLowerCase()
    : event.key === item.key;
  if (!keyMatches || (item.code && event.code !== item.code)) return false;
  if ((event.ctrlKey || event.metaKey) !== Boolean(item.nativeModifier)) return false;
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
  display: string,
  key: string,
  modifiers: Omit<ShortcutChord, "id" | "display" | "key"> = {},
): ShortcutChord {
  return { id, display, key, ...modifiers };
}
