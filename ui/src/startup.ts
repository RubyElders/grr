import type { WindowChromeKind } from "./windowChrome/model";

export type TaskScheduler = (callback: () => void) => unknown;

export async function startReviewWindow({ resolveChrome, renderReview, renderError, reveal }: {
  resolveChrome(): Promise<WindowChromeKind>;
  renderReview(kind: WindowChromeKind): void;
  renderError(error: unknown): void;
  reveal(): void | Promise<void>;
}): Promise<void> {
  try {
    renderReview(await resolveChrome());
  } catch (error) {
    renderError(error);
  }
  runAfterRender(reveal);
}

export function runAfterRender(
  action: () => void | Promise<void>,
  scheduleTask: TaskScheduler = (callback) => setTimeout(callback, 0),
): void {
  scheduleTask(() => {
    void action();
  });
}
