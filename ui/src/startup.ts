export type TaskScheduler = (callback: () => void) => unknown;

export function runAfterRender(
  action: () => void | Promise<void>,
  scheduleTask: TaskScheduler = (callback) => setTimeout(callback, 0),
): void {
  scheduleTask(() => {
    void action();
  });
}
