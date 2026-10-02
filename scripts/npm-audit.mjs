import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exceptions = {
  "basic-ftp": { version: "5.3.1", ids: ["GHSA-c475-qrg2-pj4r"] },
  "extract-zip": { version: "2.0.1", ids: ["GHSA-jmr9-qjv8-65gv", "GHSA-7pqw-9j4j-h8q3"] },
  "serialize-javascript": { version: "6.0.2", ids: ["GHSA-5c6j-r48x-rmvq", "GHSA-qj8w-gfj5-8c6v"] },
};

export function checkAudit(report, lock) {
  if (report.error || report.auditReportVersion !== 2 || !report.vulnerabilities
    || report.metadata?.vulnerabilities?.total !== Object.keys(report.vulnerabilities).length) {
    throw new Error("Invalid npm audit report");
  }
  const rejected = new Set();
  const reviewed = new Set();
  for (const [name, finding] of Object.entries(report.vulnerabilities)) {
    if (!Array.isArray(finding.via) || finding.via.length === 0) throw new Error("Missing advisory details");
    for (const advisory of finding.via) {
      if (typeof advisory === "string") {
        if (!Object.hasOwn(report.vulnerabilities, advisory)) throw new Error("Missing transitive advisory");
        continue;
      }
      const exception = exceptions[name];
      const id = advisory.url?.replace("https://github.com/advisories/", "");
      const allowed = exception?.ids.includes(id) && finding.nodes?.length > 0
        && finding.nodes.every((path) => lock.packages?.[path]?.dev === true
          && lock.packages[path].version === exception.version);
      (allowed ? reviewed : rejected).add(`${name}: ${advisory.url}`);
    }
  }
  if (Object.keys(report.vulnerabilities).length > 0 && reviewed.size + rejected.size === 0) {
    throw new Error("No source advisories in npm audit report");
  }
  return { reviewed: [...reviewed], rejected: [...rejected] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 10_000_000 });
    if (result.error || ![0, 1].includes(result.status)) throw result.error ?? new Error(result.stderr);
    const report = JSON.parse(result.stdout);
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    const { reviewed, rejected } = checkAudit(report, lock);
    for (const finding of reviewed) console.log(`Reviewed development exception: ${finding}`);
    for (const finding of rejected) console.error(finding);
    process.exitCode = rejected.length > 0 ? 1 : 0;
    if (rejected.length === 0) console.log("npm advisory policy passed");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
