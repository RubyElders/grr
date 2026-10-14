import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import type { ReviewData, HistoryPage } from "../../ui/src/types";

describe("review boundary snapshot", () => {
  it("pins the base across selection and history commands until reload", async () => {
    await browser.waitUntil(async () => await browser.execute(() =>
      Boolean(document.querySelector("nav[aria-label='File tree']")),
    ), { timeout: 15_000, interval: 50 });
    const initial = await browser.execute(async () => {
      const core = (window as unknown as {
        __TAURI_INTERNALS__: { invoke(command: string, args?: unknown): Promise<ReviewData> };
      }).__TAURI_INTERNALS__;
      const review = await core.invoke("get_review");
      return { repository: review.repositoryRoot, comparison: review.comparison,
        oldest: review.commits.at(-1)!.id, count: review.commits.length };
    });
    expect(basename(initial.repository)).toMatch(/^grr-e2e-/);
    const previous = execFileSync("git", ["rev-parse", "refs/heads/main"], { cwd: initial.repository, encoding: "utf8" }).trim();
    execFileSync("git", ["update-ref", "refs/heads/main", initial.oldest, previous], { cwd: initial.repository });
    try {
      const selected = await browser.execute(async (id) => {
        const core = (window as unknown as {
          __TAURI_INTERNALS__: { invoke(command: string, args?: unknown): Promise<ReviewData> };
        }).__TAURI_INTERNALS__;
        return (await core.invoke("select_commits", { commitIds: [id] })).comparison;
      }, initial.oldest);
      expect(selected).toEqual(initial.comparison);
      const boundaryIndex = await browser.execute(async (base) => {
        const core = (window as unknown as {
          __TAURI_INTERNALS__: { invoke(command: string, args?: unknown): Promise<HistoryPage> };
        }).__TAURI_INTERNALS__;
        const history = await core.invoke("get_history", { offset: 0, limit: 200 });
        return history.commits.findIndex((commit) => commit.id === base);
      }, initial.comparison.mergeBaseId);
      expect(boundaryIndex).toBe(initial.count);
      await browser.execute(() => document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "r", ctrlKey: true, bubbles: true, cancelable: true,
      })));
      await browser.waitUntil(async () => await browser.execute(async (base) => {
        const core = (window as unknown as {
          __TAURI_INTERNALS__: { invoke(command: string): Promise<ReviewData> };
        }).__TAURI_INTERNALS__;
        return (await core.invoke("get_review")).comparison.mergeBaseId === base;
      }, initial.oldest), { timeout: 10_000, interval: 50, timeoutMsg: "reload did not refresh the pinned base" });
    } finally {
      execFileSync("git", ["update-ref", "refs/heads/main", previous], { cwd: initial.repository });
    }
  });
});
