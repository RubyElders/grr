import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const packageVersion = readJson("package.json").version;
const lock = readJson("package-lock.json");
const tauriVersion = readJson("src-tauri/tauri.conf.json").version;
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargo.match(/^\[package\]\s*\n[\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLock = readFileSync("src-tauri/Cargo.lock", "utf8");
const cargoLockVersion = cargoLock.match(/^name = "grr"\nversion = "([^"]+)"/m)?.[1];
const versions = [packageVersion, lock.version, lock.packages[""].version, tauriVersion, cargoVersion, cargoLockVersion];
const tag = process.argv[2];

if (
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageVersion)
  || versions.some((version) => version !== packageVersion)
  || tag !== `v${packageVersion}`
) {
  throw new Error(`Release tag ${tag} must match all package versions: ${versions.join(", ")}`);
}

console.log(`Release ${tag} matches all package versions`);
