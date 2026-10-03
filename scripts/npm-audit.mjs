import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function checkAudit(report) {
  if (report.error || report.auditReportVersion !== 2 || !report.vulnerabilities
    || report.metadata?.vulnerabilities?.total !== Object.keys(report.vulnerabilities).length) {
    throw new Error("Invalid npm audit report");
  }
  const rejected = new Set();
  for (const [name, finding] of Object.entries(report.vulnerabilities)) {
    if (!Array.isArray(finding.via) || finding.via.length === 0) throw new Error("Missing advisory details");
    for (const advisory of finding.via) {
      if (typeof advisory === "string") {
        if (!Object.hasOwn(report.vulnerabilities, advisory)) throw new Error("Missing transitive advisory");
        continue;
      }
      if (typeof advisory.url !== "string") throw new Error("Missing advisory URL");
      rejected.add(`${name}: ${advisory.url}`);
    }
  }
  if (Object.keys(report.vulnerabilities).length > 0 && rejected.size === 0) {
    throw new Error("No source advisories in npm audit report");
  }
  return { rejected: [...rejected] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 10_000_000 });
    if (result.error || ![0, 1].includes(result.status)) throw result.error ?? new Error(result.stderr);
    const report = JSON.parse(result.stdout);
    const { rejected } = checkAudit(report);
    for (const finding of rejected) console.error(finding);
    process.exitCode = rejected.length > 0 ? 1 : 0;
    if (rejected.length === 0) console.log("npm advisory policy passed");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
