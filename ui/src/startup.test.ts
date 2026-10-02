import { describe, expect, it, vi } from "vitest";
import { runAfterRender, startReviewWindow, type TaskScheduler } from "./startup";

describe("runAfterRender", () => {
  it("reveals the window in the next task after rendering", () => {
    const tasks: Array<() => void> = [];
    const scheduleTask: TaskScheduler = (callback) => {
      tasks.push(callback);
    };
    const reveal = vi.fn();

    runAfterRender(reveal, scheduleTask);
    expect(reveal).not.toHaveBeenCalled();

    tasks.shift()?.();
    expect(reveal).toHaveBeenCalledOnce();
  });
});

describe("startReviewWindow", () => {
  it("resolves the platform before rendering and reveals the rendered window", async () => {
    const calls: string[] = [];
    const renderError = vi.fn();
    await startReviewWindow({
      resolveChrome: async () => { calls.push("resolve"); return "gtk-native"; },
      renderReview: (kind) => { calls.push(kind); },
      renderError,
      reveal: () => { calls.push("show"); },
    });
    expect(calls).toEqual(["resolve", "gtk-native"]);
    await vi.waitFor(() => expect(calls).toEqual(["resolve", "gtk-native", "show"]));
    expect(renderError).not.toHaveBeenCalled();
  });

  it("reveals an error when the platform query fails", async () => {
    const error = new Error("bridge unavailable");
    const renderReview = vi.fn();
    const renderError = vi.fn();
    const reveal = vi.fn();
    await startReviewWindow({
      resolveChrome: () => Promise.reject(error), renderReview, renderError, reveal,
    });
    expect(renderReview).not.toHaveBeenCalled();
    expect(renderError).toHaveBeenCalledWith(error);
    await vi.waitFor(() => expect(reveal).toHaveBeenCalledOnce());
  });
});
