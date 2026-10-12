import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

describe("combined commit selection", () => {
  it("shows a committed and uncommitted change to a file once in both panes", async () => {
    await browser.waitUntil(async () => await browser.execute(() =>
      Boolean(document.querySelector("nav[aria-label='File tree']")),
    ), { timeout: 15_000, interval: 50 });
    const repository = await browser.execute(async () => {
      const core = (window as unknown as {
        __TAURI_INTERNALS__: { invoke(command: string): Promise<{ repositoryRoot: string }> };
      }).__TAURI_INTERNALS__;
      return (await core.invoke("get_review")).repositoryRoot;
    });
    const path = join(repository, "src/review.rs");
    const original = readFileSync(path);
    writeFileSync(path, "pub fn answer() -> u32 {\n    43\n}\n");
    try {
      await browser.execute(() => document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "r", ctrlKey: true, bubbles: true, cancelable: true,
      })));
      await browser.waitUntil(async () => await browser.execute(() =>
        Boolean(document.querySelector("nav button[title='src/review.rs']"))
          && !document.querySelector("main [role='status']"),
      ), { timeout: 10_000, interval: 50 });
      await browser.execute(() => document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "c", bubbles: true, cancelable: true,
      })));
      await browser.waitUntil(async () => await browser.execute(() =>
        Boolean(document.querySelector("[role='dialog'][aria-label='Choose commits']")),
      ), { timeout: 5_000, interval: 50 });
      await browser.execute(() => {
        const label = [...document.querySelectorAll("label")].find((label) => label.textContent?.includes("Return the correct answer"))!;
        label.querySelector<HTMLInputElement>("input")!.click();
      });
      await browser.waitUntil(async () => await browser.execute(() =>
        [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Show (2)"),
      ), { timeout: 5_000, interval: 50 });
      await browser.execute(() => [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.trim() === "Show (2)")!.click());
      await browser.waitUntil(async () => await browser.execute(() => {
        const cards = [...document.querySelectorAll("main article")].filter((card) => card.querySelector("header")?.textContent?.includes("src/review.rs"));
        return !document.querySelector("main [role='status']")
          && document.querySelectorAll("nav button[title='src/review.rs']").length === 1
          && cards.length === 1 && cards[0]!.textContent?.includes("43");
      }), { timeout: 10_000, interval: 50, timeoutMsg: "combined selection duplicated the file or lost the worktree change" });
    } finally {
      writeFileSync(path, original);
    }
  });
});
