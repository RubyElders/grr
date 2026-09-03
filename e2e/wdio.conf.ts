import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { WdioTauriConfig } from "@wdio/native-types";

const repository = mkdtempSync(join(tmpdir(), "grr-e2e-"));
mkdirSync(join(repository, "src"));
const cppDirectory = join(repository, "engine", "Poseidon", "AI");
const cppPath = join(cppDirectory, "AISubgroup.cpp");
const overflowDirectory = join(repository, "overflow");
mkdirSync(cppDirectory, { recursive: true });
mkdirSync(overflowDirectory);
writeFileSync(join(repository, "src", "review.rs"), "pub fn answer() -> u32 {\n    41\n}\n");
writeFileSync(cppPath, cppSource(41));
writeOverflowFiles(41);
for (const args of [
  ["init", "-q"],
  ["config", "user.name", "E2E User"],
  ["config", "user.email", "e2e@example.com"],
  ["add", "."],
  ["commit", "-qm", "Initial fixture"],
  ["branch", "-M", "main"],
  ["switch", "-qc", "feature/review-picker"],
]) execFileSync("git", args, { cwd: repository });
writeFileSync(join(repository, "src", "review.rs"), "pub fn answer() -> u32 {\n    42\n}\n");
for (const args of [["add", "src/review.rs"], ["commit", "-qm", `Return the correct answer\n\nExplain why the fixture answer changes.\n${"Keep this deliberately long commit body visible without widening the application shell. ".repeat(16)}`]]) {
  execFileSync("git", args, { cwd: repository });
}
writeFileSync(cppPath, cppSource(42));
for (const args of [["add", cppPath], ["commit", "-qm", "Update AI subgroup answer"]]) {
  execFileSync("git", args, { cwd: repository });
}
writeOverflowFiles(42);
for (const args of [["add", "overflow"], ["commit", "-qm", "Update overflow fixtures"]]) {
  execFileSync("git", args, { cwd: repository });
}
writeFileSync(join(repository, "README.md"), "# Fixture\n");
for (const args of [["add", "README.md"], ["commit", "-qm", "Document the fixture"]]) {
  execFileSync("git", args, { cwd: repository });
}
writeFileSync(join(repository, "worktree-note.txt"), "This change has not been committed.\n");

export const config: WdioTauriConfig = {
  runner: "local",
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [{
    browserName: "tauri",
    "tauri:options": {
      application: resolve("target/release/grr"),
      args: [repository],
      webviewOptions: { width: 1280, height: 820 },
    },
    "wdio:tauriServiceOptions": {
      driverProvider: "external",
      captureBackendLogs: true,
      captureFrontendLogs: true,
    },
  }],
  services: [["tauri", {
    driverProvider: "external",
    appBinaryPath: resolve("target/release/grr"),
    appArgs: [repository],
    autoInstallTauriDriver: false,
  }]],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { timeout: 120_000 },
  logLevel: "warn",
  onComplete: () => rmSync(repository, { recursive: true, force: true }),
};

function cppSource(answer: number): string {
  return [
    ...Array.from({ length: 1053 }, (_, index) => `// fixture line ${index + 1}`),
    "void AISubgroup::DeleteCommand(NetworkId id)",
    "{",
    "    Command* task = _stack[id]._task;",
    "    if (task == nullptr)",
    "        return;",
    `    const int answer = ${answer};`,
    `    consume(answer, "${"shared horizontal scrolling fixture ".repeat(12)}");`,
    "}",
    "",
  ].join("\n");
}

function writeOverflowFiles(value: number): void {
  for (let index = 0; index < 12; index += 1) {
    writeFileSync(
      join(overflowDirectory, `fixture-${index.toString().padStart(2, "0")}.txt`),
      `first line\nvalue = ${value}\nlast line\n`,
    );
  }
}
