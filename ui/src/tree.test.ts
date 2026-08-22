import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/review.json";
import { baseName, buildFileTree, filesInTreeOrder, filteredFiles } from "./tree";
import type { ReviewData } from "./types";

const files = (fixture as ReviewData).files;

describe("file tree selectors", () => {
  it("groups nested paths and sorts them", () => {
    const tree = buildFileTree(files);
    expect(tree.directories.map((directory) => directory.name)).toEqual(["engine", "tests"]);
    expect(tree.directories[1]?.directories[0]?.name).toBe("rendering");
  });

  it("flattens files in the same order as the rendered tree", () => {
    const template = files[0]!;
    const unordered = [
      { ...template, id: "root-z", displayPath: "z-root.ts" },
      { ...template, id: "nested", displayPath: "alpha/z/b.ts" },
      { ...template, id: "root-a", displayPath: "a-root.ts" },
      { ...template, id: "direct", displayPath: "alpha/a.ts" },
      { ...template, id: "beta", displayPath: "beta/file.ts" },
    ];

    expect(filesInTreeOrder(unordered).map((file) => file.displayPath)).toEqual([
      "alpha/z/b.ts",
      "alpha/a.ts",
      "beta/file.ts",
      "a-root.ts",
      "z-root.ts",
    ]);
  });

  it("filters case-insensitively", () => {
    expect(filteredFiles(files, "GRAPHICS")).toHaveLength(1);
    expect(filteredFiles(files, " missing ")).toEqual([]);
    expect(filteredFiles(files, " ")).toHaveLength(2);
  });

  it("extracts a basename", () => expect(baseName("a/b/c.rs")).toBe("c.rs"));
});
