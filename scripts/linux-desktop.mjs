import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "linux") throw new Error("Desktop integration requires Linux");
const action = process.argv[2];
if (action !== "install" && action !== "uninstall") throw new Error("Expected install or uninstall");

const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
if (!isAbsolute(dataHome)) throw new Error("XDG_DATA_HOME must be an absolute path");
const root = fileURLToPath(new URL("../", import.meta.url));
const files = [
  ["packaging/com.rubyelders.grr.desktop", "applications/com.rubyelders.grr.desktop"],
  ["src-tauri/icons/icon.png", "icons/hicolor/512x512/apps/com.rubyelders.grr.png"],
];

for (const [source, relativeTarget] of files) {
  const target = join(dataHome, relativeTarget);
  if (action === "install") {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, source), target);
    await chmod(target, 0o644);
  } else {
    await unlink(target).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

for (const [command, args] of [
  ["update-desktop-database", [join(dataHome, "applications")]],
  ["gtk-update-icon-cache", ["-f", "-t", join(dataHome, "icons", "hicolor")]],
]) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error?.code === "ENOENT") continue;
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed`);
}
