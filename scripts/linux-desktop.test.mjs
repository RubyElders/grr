import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("linux-desktop.mjs", import.meta.url));
function run(action, dataHome) {
  return spawnSync(process.execPath, [script, action], {
    env: { ...process.env, XDG_DATA_HOME: dataHome, PATH: "" },
    encoding: "utf8",
  });
}

test("installs and removes only the app's desktop files", { skip: process.platform !== "linux" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "grr-desktop-test-"));
  try {
    const dataHome = join(directory, "data with spaces");
    const applications = join(dataHome, "applications");
    await mkdir(applications, { recursive: true });
    const unrelated = join(applications, "other.desktop");
    await writeFile(unrelated, "keep me");
    const installed = run("install", dataHome);
    assert.equal(installed.status, 0, installed.stderr);
    const desktop = join(applications, "com.rubyelders.grr.desktop");
    const icon = join(dataHome, "icons/hicolor/512x512/apps/com.rubyelders.grr.png");
    assert.equal(await readFile(desktop, "utf8"), await readFile(new URL("../packaging/com.rubyelders.grr.desktop", import.meta.url), "utf8"));
    assert.deepEqual(await readFile(icon), await readFile(new URL("../src-tauri/icons/icon.png", import.meta.url)));
    assert.equal((await stat(desktop)).mode & 0o777, 0o644);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const removed = run("uninstall", dataHome);
      assert.equal(removed.status, 0, removed.stderr);
    }
    await assert.rejects(stat(desktop), { code: "ENOENT" });
    await assert.rejects(stat(icon), { code: "ENOENT" });
    assert.equal(await readFile(unrelated, "utf8"), "keep me");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects invalid actions and relative data directories", { skip: process.platform !== "linux" }, () => {
  assert.notEqual(run("unknown", "/tmp").status, 0);
  assert.notEqual(run("install", "relative").status, 0);
});
