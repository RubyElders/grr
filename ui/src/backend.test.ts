import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { tauriBackend } from "./backend";

describe("tauri backend adapter", () => {
  beforeEach(() => invoke.mockReset());

  it("loads the review through the expected command", async () => {
    invoke.mockResolvedValue({ files: [] });
    await expect(tauriBackend.getReview()).resolves.toEqual({ files: [] });
    expect(invoke).toHaveBeenCalledWith("get_review");
  });

  it("submits the complete review payload", async () => {
    invoke.mockResolvedValue(undefined);
    const review = { outcome: "approve" as const, comments: [] };
    await tauriBackend.finishReview(review);
    expect(invoke).toHaveBeenCalledWith("finish_review", { review });
  });

  it("closes a cancelled review through the expected command", async () => {
    invoke.mockResolvedValue(undefined);
    await tauriBackend.cancelReview();
    expect(invoke).toHaveBeenCalledWith("cancel_review");
  });
});
