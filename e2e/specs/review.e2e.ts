import { writeFileSync } from "node:fs";
import { browser, expect } from "@wdio/globals";

describe("grr review window", () => {
  it("navigates the real diff and creates a draft comment", async () => {
    await browser.waitUntil(async () => await browser.execute(
      () => Boolean(document.querySelector("input[aria-label='Filter files']")),
    ), { timeout: 10_000, interval: 100, timeoutMsg: "review UI did not finish loading" });
    const ready = await browser.execute(() => ({
      filter: Boolean(document.querySelector("input[aria-label='Filter files']")),
      commit: document.body.textContent?.includes("5 commits · main…HEAD"),
    }));
    expect(ready).toEqual({ filter: true, commit: true });
    const diffInsets = await browser.execute(() => {
      const pane = document.querySelector<HTMLElement>("main[aria-label='Commit diff']");
      const first = pane?.querySelector<HTMLElement>("article[data-file-id]");
      if (!pane || !first) return null;
      const paneRect = pane.getBoundingClientRect();
      const fileRect = first.getBoundingClientRect();
      return {
        top: fileRect.top - paneRect.top - pane.clientTop,
        right: paneRect.left + pane.clientLeft + pane.clientWidth - fileRect.right,
        left: fileRect.left - paneRect.left - pane.clientLeft,
      };
    });
    expect(diffInsets).not.toBeNull();
    for (const inset of Object.values(diffInsets ?? {})) expect(Math.abs(inset - 24)).toBeLessThanOrEqual(1);
    writeFileSync("e2e-results/window.html", await browser.getPageSource());
    writeFileSync("e2e-results/window.png", Buffer.from(await browser.takeScreenshot(), "base64"));

    await browser.execute(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true, cancelable: true }));
    });
    await browser.waitUntil(async () => await browser.execute(
      () => Boolean(document.querySelector("section[role='dialog'][aria-label='Keyboard shortcuts']")),
    ), { timeout: 5_000, interval: 50, timeoutMsg: "question mark did not open keyboard shortcuts" });
    expect(await browser.execute(() => (
      document.body.textContent?.includes("Jump to the next changed file")
      && document.body.textContent?.includes("Approve or share queued comments")
    ))).toBe(true);
    writeFileSync("e2e-results/keyboard-shortcuts.png", Buffer.from(await browser.takeScreenshot(), "base64"));
    await browser.execute(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await browser.waitUntil(async () => await browser.execute(
      () => !document.querySelector("section[role='dialog'][aria-label='Keyboard shortcuts']"),
    ), { timeout: 5_000, interval: 50, timeoutMsg: "Escape did not close keyboard shortcuts" });

    await browser.execute(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await browser.waitUntil(async () => await browser.execute(
      () => Boolean(document.querySelector("input[aria-label='Find in code']")),
    ), { timeout: 5_000, interval: 50, timeoutMsg: "Ctrl+F did not open code search" });
    await setInputValue("input[aria-label='Find in code']", "answer");
    const find = await browser.execute(() => {
      const search = document.querySelector<HTMLElement>("section[role='search'][aria-label='Find in diff']");
      const content = search?.parentElement;
      const searchRect = search?.getBoundingClientRect();
      const contentRect = content?.getBoundingClientRect();
      return search && searchRect && contentRect ? {
        result: search.querySelector("[role='status']")?.textContent,
        marked: document.querySelectorAll("mark[data-search-match]").length,
        topRight: searchRect.top >= contentRect.top && contentRect.right - searchRect.right <= 40,
      } : null;
    });
    expect(find?.result).toMatch(/^1 of \d+$/);
    expect(find?.marked).toBeGreaterThan(0);
    expect(find?.topRight).toBe(true);
    writeFileSync("e2e-results/code-search.png", Buffer.from(await browser.takeScreenshot(), "base64"));
    await browser.execute(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(await browser.execute(() => Boolean(document.querySelector("input[aria-label='Filter files']"))
      && !document.querySelector("input[aria-label='Find in code']"))).toBe(true);
    await browser.execute(() => {
      const pane = document.querySelector<HTMLElement>("main[aria-label='Commit diff']");
      if (pane) pane.scrollTop = 0;
    });

    await browser.execute(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
    });
    await browser.waitUntil(async () => await browser.execute(
      () => (document.querySelector<HTMLElement>("main[aria-label='Commit diff']")?.scrollTop ?? 0) > 0,
    ), { timeout: 5_000, interval: 50, timeoutMsg: "Space did not page the diff down" });
    await browser.execute(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", shiftKey: true, bubbles: true, cancelable: true }));
    });
    await browser.waitUntil(async () => await browser.execute(
      () => (document.querySelector<HTMLElement>("main[aria-label='Commit diff']")?.scrollTop ?? -1) === 0,
    ), { timeout: 5_000, interval: 50, timeoutMsg: "Shift+Space did not page the diff up" });

    await clickElement("button[title='Choose commits to review']");
    const picker = await browser.execute(() => {
      const dialog = document.querySelector<HTMLElement>("section[role='dialog'][aria-label='Choose commits']");
      const rect = dialog?.getBoundingClientRect();
      return dialog && rect ? {
        rows: dialog.querySelectorAll("input[type='checkbox']").length,
        insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      } : null;
    });
    expect(picker).toEqual({ rows: 5, insideViewport: true });
    expect(await browser.execute(
      () => document.body.textContent?.includes("Uncommitted changes")
        && document.body.textContent?.includes("Virtual"),
    )).toBe(true);
    await clickElement("button[aria-label='Show full message for Return the correct answer']");
    expect(await browser.execute(
      () => document.body.textContent?.includes("Keep this body visible in the review picker."),
    )).toBe(true);
    writeFileSync("e2e-results/commit-picker.png", Buffer.from(await browser.takeScreenshot(), "base64"));

    const allScrollPosition = await browser.execute(() => {
      const pane = document.querySelector<HTMLElement>("main[aria-label='Commit diff']");
      if (!pane) throw new Error("diff pane was not available");
      pane.scrollTop = 600;
      pane.dispatchEvent(new Event("scroll"));
      return pane.scrollTop;
    });
    expect(allScrollPosition).toBeGreaterThan(0);
    await clickElement("button[aria-label='Show only Return the correct answer']");
    await browser.waitUntil(async () => await browser.execute(
      () => document.body.textContent?.includes("Return the correct answer")
        && Boolean(document.querySelector("article [title*='Return the correct answer']"))
        && document.querySelector<HTMLElement>("main[aria-label='Commit diff']")?.scrollTop === 0,
    ), { timeout: 5_000, interval: 50, timeoutMsg: "single-commit diff did not load" });
    const collapsedMessageHeight = await browser.execute(() => {
      const panel = document.querySelector<HTMLElement>("section[aria-label='Commit message']");
      const expand = panel?.querySelector<HTMLButtonElement>("button[aria-label='Expand commit message']");
      return panel && expand ? {
        height: panel.getBoundingClientRect().height,
        body: panel.textContent?.includes("Explain why the fixture answer changes."),
        newer: Boolean(document.querySelector("button[aria-label='Show newer commit Update AI subgroup answer']")),
        olderDisabled: document.querySelector<HTMLButtonElement>("button[aria-label='No older commit']")?.disabled,
      } : null;
    });
    expect(collapsedMessageHeight?.height).toBeLessThanOrEqual(36);
    expect(collapsedMessageHeight).toMatchObject({ body: true, newer: true, olderDisabled: true });
    await clickElement("button[aria-label='Expand commit message']");
    const expandedMessageHeight = await browser.execute(() => (
      document.querySelector<HTMLElement>("section[aria-label='Commit message']")?.getBoundingClientRect().height ?? 0
    ));
    expect(expandedMessageHeight).toBeGreaterThan(collapsedMessageHeight?.height ?? 0);
    writeFileSync("e2e-results/commit-message.png", Buffer.from(await browser.takeScreenshot(), "base64"));
    await clickElement("button[aria-label='Show newer commit Update AI subgroup answer']");
    await browser.waitUntil(async () => await browser.execute(
      () => document.body.textContent?.includes("Update AI subgroup answer")
        && Boolean(document.querySelector("article [title*='Update AI subgroup answer']")),
    ), { timeout: 5_000, interval: 50, timeoutMsg: "newer commit arrow did not load its neighbor" });
    await clickElement("button[title='Choose commits to review']");
    await clickButton("Show all");
    await browser.waitUntil(async () => await browser.execute(
      (expectedScrollTop) => document.body.textContent?.includes("5 commits · main…HEAD")
        && !document.querySelector("article [title*='Return the correct answer']")
        && Math.abs((document.querySelector<HTMLElement>("main[aria-label='Commit diff']")?.scrollTop ?? -1) - expectedScrollTop) <= 1,
      allScrollPosition,
    ), { timeout: 5_000, interval: 50, timeoutMsg: "full branch diff did not restore its scroll position" });

    await clickElement("button[title='Choose commits to review']");
    await clickElement("button[aria-label='Show only Uncommitted changes']");
    await browser.waitUntil(async () => await browser.execute(
      () => document.body.textContent?.includes("worktree by Local working tree")
        && Boolean(document.querySelector("article [title='worktree · Uncommitted changes']")),
    ), { timeout: 5_000, interval: 50, timeoutMsg: "virtual worktree commit did not load" });
    await clickElement("button[title='Choose commits to review']");
    await clickButton("Show all");
    await browser.waitUntil(async () => await browser.execute(
      () => document.body.textContent?.includes("5 commits · main…HEAD"),
    ), { timeout: 5_000, interval: 50, timeoutMsg: "full diff did not return after worktree review" });

    for (const step of [
      { key: "ArrowRight", text: "worktree by Local working tree" },
      { key: "ArrowRight", text: "by E2E User" },
      { key: "ArrowLeft", text: "worktree by Local working tree" },
      { key: "ArrowLeft", text: "5 commits · main…HEAD" },
    ]) {
      await browser.execute((key) => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      }, step.key);
      await browser.waitUntil(async () => await browser.execute(
        (text) => document.body.textContent?.includes(text),
        step.text,
      ), { timeout: 5_000, interval: 50, timeoutMsg: `${step.key} did not navigate to ${step.text}` });
    }

    const longHeader = await browser.execute(() => {
      const section = Array.from(document.querySelectorAll<HTMLElement>("section[aria-label]"))
        .find((candidate) => candidate.getAttribute("aria-label")?.includes("AISubgroup::DeleteCommand"));
      const text = section?.querySelector<HTMLElement>("div > span:last-child");
      return text ? {
        text: text.textContent,
        whiteSpace: getComputedStyle(text).whiteSpace,
        height: text.getBoundingClientRect().height,
      } : null;
    });
    expect(longHeader).not.toBeNull();
    expect(longHeader?.text).toContain("@@ void AISubgroup::DeleteCommand(NetworkId id)");
    expect(longHeader?.whiteSpace).toBe("pre");
    expect(longHeader?.height).toBeLessThanOrEqual(32);

    const horizontalScroll = await browser.execute(() => {
      const scroller = document.querySelector<HTMLElement>("[aria-label='Scrollable diff for engine/Poseidon/AI/AISubgroup.cpp']");
      if (!scroller) return null;
      const codeCells = Array.from(scroller.querySelectorAll<HTMLElement>("[data-line-id] code"));
      scroller.scrollLeft = 180;
      return {
        overflows: scroller.scrollWidth > scroller.clientWidth,
        scrollLeft: scroller.scrollLeft,
        nestedScrollers: codeCells.filter((cell) => ["auto", "scroll"].includes(getComputedStyle(cell).overflowX)).length,
      };
    });
    expect(horizontalScroll).toEqual({ overflows: true, scrollLeft: 180, nestedScrollers: 0 });

    await clickElement("button[title='engine/Poseidon/AI/AISubgroup.cpp']");
    const outerScroll = await browser.execute(() => ({
      document: document.documentElement.scrollLeft,
      body: document.body.scrollLeft,
      pane: document.querySelector<HTMLElement>("main[aria-label='Commit diff']")?.scrollLeft ?? -1,
    }));
    expect(outerScroll).toEqual({ document: 0, body: 0, pane: 0 });

    const commentButtonAlignment = await browser.execute(() => {
      const button = document.querySelector<HTMLButtonElement>("button[aria-label*='AISubgroup.cpp R1059']");
      const newLineNumber = button?.nextElementSibling?.nextElementSibling;
      if (!button || !(newLineNumber instanceof HTMLElement)) return null;
      const buttonRect = button.getBoundingClientRect();
      const numberRect = newLineNumber.getBoundingClientRect();
      return Math.abs(buttonRect.left + buttonRect.width / 2 - numberRect.right);
    });
    expect(commentButtonAlignment).not.toBeNull();
    expect(commentButtonAlignment).toBeLessThanOrEqual(1);

    const finalFileId = await browser.execute(() => {
      const pane = document.querySelector<HTMLElement>("main[aria-label='Commit diff']");
      const files = pane?.querySelectorAll<HTMLElement>("article[data-file-id]");
      const finalFile = files?.item((files?.length ?? 1) - 1);
      if (!pane || !finalFile) return null;
      pane.scrollTop = pane.scrollHeight;
      pane.dispatchEvent(new Event("scroll"));
      return finalFile.dataset.fileId ?? null;
    });
    expect(finalFileId).not.toBeNull();
    const bottomInset = await browser.execute(() => {
      const pane = document.querySelector<HTMLElement>("main[aria-label='Commit diff']");
      const files = pane?.querySelectorAll<HTMLElement>("article[data-file-id]");
      const finalFile = files?.item((files?.length ?? 1) - 1);
      if (!pane || !finalFile) return null;
      const paneRect = pane.getBoundingClientRect();
      return paneRect.top + pane.clientTop + pane.clientHeight - finalFile.getBoundingClientRect().bottom;
    });
    expect(bottomInset).not.toBeNull();
    expect(Math.abs((bottomInset ?? 0) - 24)).toBeLessThanOrEqual(1);
    await browser.waitUntil(async () => await browser.execute((fileId) => {
      const row = document.querySelector<HTMLElement>(`nav[aria-label='File tree'] [data-file-id="${fileId}"]`);
      const sidebar = document.querySelector<HTMLElement>("aside[aria-label='Changed files']");
      if (!row || !sidebar || row.getAttribute("aria-current") !== "true") return false;
      const rowRect = row.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();
      return rowRect.top >= sidebarRect.top - 1 && rowRect.bottom <= sidebarRect.bottom + 1;
    }, finalFileId), {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: "file tree did not follow the visible diff file",
    });

    await browser.execute(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    });
    await browser.waitUntil(async () => await browser.execute(
      (last) => document.querySelector<HTMLElement>("nav[aria-label='File tree'] [aria-current='true']")?.dataset.fileId !== last,
      finalFileId,
    ), { timeout: 5_000, interval: 50, timeoutMsg: "ArrowUp did not select the previous file" });
    await browser.execute(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    await browser.waitUntil(async () => await browser.execute(
      (expected) => document.querySelector<HTMLElement>("nav[aria-label='File tree'] [aria-current='true']")?.dataset.fileId === expected,
      finalFileId,
    ), { timeout: 5_000, interval: 50, timeoutMsg: "ArrowDown did not select the next file" });

    await setInputValue("input[aria-label='Filter files']", "review.rs");
    expect(await browser.execute(() => Boolean(document.querySelector("button[title='src/review.rs']")))).toBe(true);
    await setInputValue("input[aria-label='Filter files']", "");

    await clickElement("button[aria-label*='src/review.rs R2']");
    await setInputValue("textarea[aria-label='Review comment']", "Please add a focused unit test.");
    await browser.execute(() => {
      const editor = document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Review comment']");
      if (!editor) throw new Error("comment editor was not open");
      editor.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    const result = await browser.execute(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
      return {
        comment: document.body.textContent?.includes("Please add a focused unit test."),
        approveDisabled: buttons.find((button) => button.textContent === "Approve")?.disabled,
        shareEnabled: !buttons.find((button) => button.textContent === "Share comments (1)")?.disabled,
        shareLabel: buttons.find((button) => button.textContent?.startsWith("Share comments"))?.textContent,
      };
    });
    expect(result).toEqual({ comment: true, approveDisabled: true, shareEnabled: true, shareLabel: "Share comments (1)" });

    try {
      await browser.execute(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }));
      });
    } catch (error) {
      expect(String(error)).toMatch(/invalid session id|session terminated/i);
    }
  });
});

async function setInputValue(selector: string, value: string): Promise<void> {
  await browser.execute((targetSelector, targetValue) => {
    const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(targetSelector);
    if (!input) throw new Error(`No input matched ${targetSelector}`);
    input.value = targetValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, selector, value);
}

async function clickElement(selector: string): Promise<void> {
  await browser.execute((targetSelector) => {
    const element = document.querySelector<HTMLElement>(targetSelector);
    if (!element) throw new Error(`No element matched ${targetSelector}`);
    element.click();
  }, selector);
}

async function clickButton(label: string): Promise<void> {
  await browser.execute((targetLabel) => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((candidate) => candidate.textContent === targetLabel);
    if (!button) throw new Error(`No button matched ${targetLabel}`);
    button.click();
  }, label);
}
