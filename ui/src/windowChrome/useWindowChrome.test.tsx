import { render, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../__fixtures__/review.json";
import type { ReviewData } from "../types";
import type { WindowChromeAction, WindowChromeKind } from "./model";
import { listenWindowChromeActions, updateWindowChrome } from "./bridge";
import { useWindowChrome } from "./useWindowChrome";

vi.mock("./bridge", () => ({ listenWindowChromeActions: vi.fn(), updateWindowChrome: vi.fn() }));

function Harness({ kind = "gtk-native", disabled = false, onAction, onError }: {
  kind?: WindowChromeKind;
  disabled?: boolean;
  onAction(action: WindowChromeAction): void;
  onError(error: unknown): void;
}) {
  useWindowChrome(kind, fixture as ReviewData, disabled, onAction, onError);
  return null;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listenWindowChromeActions).mockResolvedValue(vi.fn());
  vi.mocked(updateWindowChrome).mockResolvedValue(undefined);
});

describe("useWindowChrome", () => {
  it("keeps one listener while using the latest review actions", async () => {
    const first = vi.fn();
    const next = vi.fn();
    const onError = vi.fn();
    const stop = vi.fn();
    vi.mocked(listenWindowChromeActions).mockResolvedValue(stop);
    const view = render(<Harness onAction={first} onError={onError} />);
    await waitFor(() => expect(listenWindowChromeActions).toHaveBeenCalledOnce());
    const receive = vi.mocked(listenWindowChromeActions).mock.calls[0]![0];
    receive("sidebar");
    expect(first).toHaveBeenCalledWith("sidebar");
    view.rerender(<Harness disabled onAction={next} onError={onError} />);
    await waitFor(() => expect(updateWindowChrome).toHaveBeenCalledTimes(2));
    receive("older");
    expect(next).toHaveBeenCalledWith("older");
    expect(listenWindowChromeActions).toHaveBeenCalledOnce();
    expect(updateWindowChrome).toHaveBeenLastCalledWith(expect.objectContaining({ commitSelectionEnabled: false }));
    view.unmount();
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
    receive("help");
    expect(next).toHaveBeenCalledOnce();
  });

  it("cleans up a subscription that resolves after unmount", async () => {
    let resolve!: (stop: () => void) => void;
    vi.mocked(listenWindowChromeActions).mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<Harness onAction={vi.fn()} onError={vi.fn()} />);
    await waitFor(() => expect(listenWindowChromeActions).toHaveBeenCalledOnce());
    view.unmount();
    const stop = vi.fn();
    resolve(stop);
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });

  it.each(["html", "windows-native"] as const)("does not use native header commands in %s mode", async (kind) => {
    render(<Harness kind={kind} onAction={vi.fn()} onError={vi.fn()} />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listenWindowChromeActions).not.toHaveBeenCalled();
    expect(updateWindowChrome).not.toHaveBeenCalled();
  });

  it("reports subscription and update failures", async () => {
    vi.mocked(listenWindowChromeActions).mockRejectedValue(new Error("listen failed"));
    vi.mocked(updateWindowChrome).mockRejectedValue(new Error("update failed"));
    const onError = vi.fn();
    render(<Harness onAction={vi.fn()} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
    expect(onError).toHaveBeenCalledWith(new Error("listen failed"));
    expect(onError).toHaveBeenCalledWith(new Error("update failed"));
  });
});
