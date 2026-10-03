import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const binary = resolve("src-tauri/target/release/grr");
const identifier = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).identifier;
const repositories = [];
const instances = [];

try {
  for (let index = 0; index < 2; index += 1) {
    const repository = mkdtempSync(join(tmpdir(), "grr-multi-instance-"));
    repositories.push(repository);
    writeFileSync(join(repository, "review.txt"), `Repository ${index}\n`);
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Test User"],
      ["config", "user.email", "test@example.com"],
      ["add", "."],
      ["commit", "-qm", `Review repository ${index}`],
    ]) execFileSync("git", args, { cwd: repository });
    const child = spawn(binary, [repository], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GDK_BACKEND: "x11", NO_AT_BRIDGE: "1", GIO_USE_VFS: "local" },
    });
    const instance = { child, output: "", errors: "", exit: undefined, window: undefined };
    child.stdout.on("data", (data) => { instance.output += data; });
    child.stderr.on("data", (data) => { instance.errors += data; });
    child.on("error", (error) => { instance.errors += String(error); });
    child.on("exit", (code, signal) => { instance.exit = { code, signal }; });
    instances.push(instance);
  }

  await until(() => instances.every((instance) => {
    assert.equal(instance.exit, undefined, instance.errors);
    try {
      instance.window = execFileSync("xdotool", ["search", "--all", "--onlyvisible", "--pid", String(instance.child.pid), "--name", "grr"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n")[0];
      return Boolean(instance.window);
    } catch {
      return false;
    }
  }));
  assert.notEqual(instances[0].window, instances[1].window);
  for (const instance of instances) {
    const windowClass = execFileSync("xprop", ["-id", instance.window, "WM_CLASS"], { encoding: "utf8" }).match(/"([^"]*)"\s*$/)?.[1];
    assert.equal(windowClass?.toLowerCase(), identifier);
  }
  await new Promise((done) => setTimeout(done, 500));
  execFileSync("xdotool", ["windowfocus", "--sync", instances[0].window]);
  execFileSync("xdotool", ["key", "ctrl+Return"]);
  await until(() => instances[0].exit !== undefined);
  assert.deepEqual(instances[0].exit, { code: 0, signal: null }, instances[0].errors);
  assert.match(instances[0].output, /Review result: APPROVED/);
  assert.equal(instances[1].exit, undefined, instances[1].errors);
  execFileSync("xdotool", ["windowfocus", "--sync", instances[1].window]);
  execFileSync("xdotool", ["key", "ctrl+w"]);
  await until(() => instances[1].exit !== undefined);
  assert.deepEqual(instances[1].exit, { code: 2, signal: null }, instances[1].errors);
  assert.equal(instances[1].output, "");
  console.log("Two independent review windows passed approval and cancellation.");
} finally {
  for (const instance of instances) {
    if (instance.exit === undefined) {
      instance.child.kill("SIGTERM");
      await until(() => instance.exit !== undefined).catch(() => instance.child.kill("SIGKILL"));
    }
  }
  for (const repository of repositories) rmSync(repository, { recursive: true, force: true });
}

async function until(predicate) {
  const deadline = Date.now() + 15_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Review window timed out: ${instances.map((instance) => instance.errors).join("\n")}`);
    await new Promise((done) => setTimeout(done, 100));
  }
}
