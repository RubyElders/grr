import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { SyntaxLine } from "./SyntaxLine";

describe("SyntaxLine search highlights", () => {
  it("highlights a match that crosses syntax tokens", () => {
    const { container } = render(
      <code><SyntaxLine path="example.cpp" text="  const char* label;" matches={[{ start: 8, end: 19, index: 0 }]} activeMatchIndex={0} /></code>,
    );
    const fragments = [...container.querySelectorAll<HTMLElement>('[data-search-match="0"]')];
    expect(fragments.map((fragment) => fragment.textContent).join("")).toBe("char* label");
    expect(fragments.every((fragment) => fragment.className.includes("activeMatch"))).toBe(true);
  });
});
