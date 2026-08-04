import { writeFileSync } from "node:fs";
import { browser, expect } from "@wdio/globals";

describe("grr review window", () => {
  it("navigates the real diff and creates a draft comment", async () => {
    await browser.waitUntil(async () => await browser.execute(
      () => Boolean(document.querySelector("input[aria-label='Filter files']")),
    ), { timeout: 10_000, interval: 100, timeoutMsg: "review UI did not finish loading" });
    const ready = await browser.execute(() => ({
      filter: Boolean(document.querySelector("input[aria-label='Filter files']")),
      commit: document.body.textContent?.includes("4 commits · main…HEAD"),
    }));
    expect(ready).toEqual({ filter: true, commit: true });
    writeFileSync("e2e-results/window.html", await browser.getPageSource());
    writeFileSync("e2e-results/window.png", Buffer.from(await browser.takeScreenshot(), "base64"));

    await clickElement("button[title='Choose commits to review']");
    const picker = await browser.execute(() => {
      const dialog = document.querySelector<HTMLElement>("section[role='dialog'][aria-label='Choose commits']");
      const rect = dialog?.getBoundingClientRect();
      return dialog && rect ? {
        rows: dialog.querySelectorAll("input[type='checkbox']").length,
        insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      } : null;
    });
    expect(picker).toEqual({ rows: 4, insideViewport: true });
    writeFileSync("e2e-results/commit-picker.png", Buffer.from(await browser.takeScreenshot(), "base64"));

    await clickElement("button[aria-label='Show only Return the correct answer']");
    await browser.waitUntil(async () => await browser.execute(
      () => document.body.textContent?.includes("Return the correct answer")
        && Boolean(document.querySelector("article [title*='Return the correct answer']")),
    ), { timeout: 5_000, interval: 50, timeoutMsg: "single-commit diff did not load" });
    await clickElement("button[title='Choose commits to review']");
    await clickButton("Show all");
    await browser.waitUntil(async () => await browser.execute(
      () => document.body.textContent?.includes("4 commits · main…HEAD")
        && !document.querySelector("article [title*='Return the correct answer']"),
    ), { timeout: 5_000, interval: 50, timeoutMsg: "full branch diff did not return" });

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
    await browser.waitUntil(async () => await browser.execute((fileId) => {
      const row = document.querySelector<HTMLElement>(`nav[aria-label='File tree'] [data-file-id="${fileId}"]`);
      const sidebar = document.querySelector<HTMLElement>("aside[aria-label='Changed files']");
      if (!row || !sidebar || row.getAttribute("aria-current") !== "true") return false;
      const rowRect = row.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();
      return rowRect.top >= sidebarRect.top && rowRect.bottom <= sidebarRect.bottom;
    }, finalFileId), {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: "file tree did not follow the visible diff file",
    });

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
        shareEnabled: !buttons.find((button) => button.textContent === "Share comments")?.disabled,
      };
    });
    expect(result).toEqual({ comment: true, approveDisabled: true, shareEnabled: true });

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
