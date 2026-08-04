import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/review.json";
import { reviewViewKey } from "./scrollPosition";
import type { ReviewData } from "./types";

const data = fixture as ReviewData;

describe("review scroll-position keys", () => {
  it("identifies the cumulative comparison", () => {
    expect(reviewViewKey(data)).toBe(`all:${data.comparison.mergeBaseId}..${data.comparison.headId}`);
  });

  it("identifies commit combinations independent of selection order", () => {
    const first = { ...data, selectedCommitIds: [data.commits[1]!.id, data.commits[3]!.id] };
    const reversed = { ...data, selectedCommitIds: [...first.selectedCommitIds].reverse() };
    expect(reviewViewKey(first)).toBe(reviewViewKey(reversed));
    expect(reviewViewKey(first)).not.toBe(reviewViewKey({ ...data, selectedCommitIds: [data.commits[1]!.id] }));
  });
});
