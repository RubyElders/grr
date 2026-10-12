import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

describe("reload review", () => {
  it("shows a file created after the window opened", async () => {
    await browser.waitUntil(async () => await browser.execute(() =>
      Boolean(document.querySelector("nav[aria-label='File tree']")),
    ), { timeout: 15_000, interval: 50 });
    const repository = await browser.execute(async () => {
      const core = (window as unknown as {
        __TAURI_INTERNALS__: { invoke(command: string): Promise<{ repositoryRoot: string }> };
      }).__TAURI_INTERNALS__;
      return (await core.invoke("get_review")).repositoryRoot;
    });
    const path = join(repository, "reload-only.txt");
    writeFileSync(path, "Created while grr was open.\n", { flag: "wx" });
    try {
      await browser.execute(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", {
          key: "r", ctrlKey: true, bubbles: true, cancelable: true,
        }));
      });
      await browser.waitUntil(async () => await browser.execute(() =>
        Boolean(document.querySelector("nav button[title='reload-only.txt']"))
          && [...document.querySelectorAll("main article header")].some((header) => header.textContent?.includes("reload-only.txt")),
      ), { timeout: 10_000, interval: 50, timeoutMsg: "reload did not show the newly created file" });
    } finally {
      unlinkSync(path);
    }
  });
});
