import { describe, expect, it } from "vitest";
import { highlightLine, languageForPath } from "./syntax";

describe("syntax highlighting", () => {
  it("detects common languages from paths", () => {
    expect(languageForPath("engine/GraphicsPage.cpp")).toBe("c");
    expect(languageForPath("ui/App.tsx")).toBe("script");
    expect(languageForPath("script/review.py")).toBe("python");
    expect(languageForPath("Gemfile")).toBe("ruby");
    expect(languageForPath("notes.txt")).toBe("plain");
  });

  it("highlights code without changing its text", () => {
    const line = 'const char* message = "hello"; // note';
    const tokens = highlightLine(line, "sample.cpp");
    expect(tokens.map((token) => token.text).join("")).toBe(line);
    expect(tokens).toEqual(expect.arrayContaining([
      { kind: "keyword", text: "const" },
      { kind: "type", text: "char" },
      { kind: "string", text: '"hello"' },
      { kind: "comment", text: "// note" },
    ]));
  });

  it("recognizes functions, numbers, literals, and preprocessor lines", () => {
    expect(highlightLine("def answer(value = 42):", "review.py")).toEqual(expect.arrayContaining([
      { kind: "keyword", text: "def" },
      { kind: "function", text: "answer" },
      { kind: "number", text: "42" },
    ]));
    expect(highlightLine("return true", "review.ts")).toEqual(expect.arrayContaining([
      { kind: "keyword", text: "return" },
      { kind: "literal", text: "true" },
    ]));
    expect(highlightLine("#include <vector>", "review.cpp")).toEqual([
      { kind: "meta", text: "#include <vector>" },
    ]);
  });

  it("leaves unknown text files plain", () => {
    expect(highlightLine("const value = 42", "notes.txt")).toEqual([
      { kind: "plain", text: "const value = 42" },
    ]);
  });
});
