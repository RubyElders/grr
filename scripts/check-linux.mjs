import { spawnSync } from "node:child_process";

if (process.platform !== "linux") throw new Error("System libgit2 linkage checks require Linux");

const result = spawnSync("ldd", ["src-tauri/target/release/grr"], { encoding: "utf8" });
if (result.error) throw result.error;
const linkage = result.stdout.split("\n").find((line) => /libgit2\.so\.1\.9\s+=>\s+\//.test(line));
if (result.status !== 0 || !linkage) {
  throw new Error(`The release executable must link to system libgit2 1.9:\n${result.stdout}${result.stderr}`);
}
console.log(linkage.trim());
