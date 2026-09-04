import { describe, expect, it } from "vitest";
import { matchesShortcut, SHORTCUTS, shortcutTitle } from "./shortcuts";

function key(keyValue: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return { key: keyValue, code: keyValue === " " ? "Space" : keyValue, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers } as KeyboardEvent;
}

describe("shortcut registry", () => {
  it("has unique action and chord identifiers", () => {
    expect(new Set(SHORTCUTS.map((shortcut) => shortcut.id)).size).toBe(SHORTCUTS.length);
    for (const shortcut of SHORTCUTS) {
      expect(new Set(shortcut.chords.map((chord) => chord.id)).size).toBe(shortcut.chords.length);
      expect(shortcut.description).not.toBe("");
    }
  });

  it("matches native modifiers on either platform without accepting extras", () => {
    expect(matchesShortcut(key("f", { ctrlKey: true }), "find", "native")).toBe(true);
    expect(matchesShortcut(key("F", { metaKey: true }), "find", "native")).toBe(true);
    expect(matchesShortcut(key("f", { ctrlKey: true, shiftKey: true }), "find", "native")).toBe(false);
    expect(matchesShortcut(key("f"), "find", "native")).toBe(false);
  });

  it("distinguishes navigation and shifted paging", () => {
    expect(matchesShortcut(key("ArrowDown"), "nextFile")).toBe(true);
    expect(matchesShortcut(key("j"), "nextFile")).toBe(true);
    expect(matchesShortcut(key("k"), "previousFile")).toBe(true);
    expect(matchesShortcut(key("h"), "newerCommit")).toBe(true);
    expect(matchesShortcut(key("l"), "olderCommit")).toBe(true);
    expect(matchesShortcut(key("j", { shiftKey: true }), "nextFile")).toBe(false);
    expect(matchesShortcut(key("ArrowDown", { altKey: true }), "nextFile")).toBe(false);
    expect(matchesShortcut(key(" "), "pageDown")).toBe(true);
    expect(matchesShortcut(key(" ", { shiftKey: true }), "pageUp")).toBe(true);
    expect(matchesShortcut(key(" ", { shiftKey: true }), "pageDown")).toBe(false);
  });

  it("formats every chord from the registry", () => {
    expect(shortcutTitle("find")).toBe("Ctrl/Cmd + F or F3");
    expect(shortcutTitle("nextFile")).toBe("Down or J");
    expect(shortcutTitle("closeWindow")).toBe("Ctrl/Cmd + W or Alt + F4");
  });
});
