import { describe, expect, it, vi } from "vitest";
import { runAfterRender, type TaskScheduler } from "./startup";

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
