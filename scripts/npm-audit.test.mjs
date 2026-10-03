import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAudit } from "./npm-audit.mjs";

const path = "node_modules/extract-zip";
const report = {
  auditReportVersion: 2,
  metadata: { vulnerabilities: { total: 2 } },
  vulnerabilities: {
    "extract-zip": { nodes: [path], via: [{ url: "https://github.com/advisories/GHSA-jmr9-qjv8-65gv" }] },
    parent: { via: ["extract-zip"] },
  },
};

test("rejects formerly excepted and new advisories", () => {
  assert.equal(checkAudit(report).rejected.length, 1);
  const changed = structuredClone(report);
  changed.vulnerabilities["extract-zip"].via[0].url = "https://github.com/advisories/GHSA-new";
  assert.equal(checkAudit(changed).rejected.length, 1);
});

test("rejects both direct and transitive findings", () => {
  for (const isDirect of [true, false]) {
    const changed = structuredClone(report);
    changed.vulnerabilities["extract-zip"].isDirect = isDirect;
    assert.equal(checkAudit(changed).rejected.length, 1);
  }
});

test("fails closed for incomplete or failed audit reports", () => {
  for (const invalid of [{}, { error: {} }, { ...report, vulnerabilities: {} }]) {
    assert.throws(() => checkAudit(invalid));
  }
  const missing = structuredClone(report);
  missing.vulnerabilities.parent.via = ["missing"];
  assert.throws(() => checkAudit(missing));
  const missingUrl = structuredClone(report);
  delete missingUrl.vulnerabilities["extract-zip"].via[0].url;
  assert.throws(() => checkAudit(missingUrl));
});

test("accepts a clean audit", () => {
  assert.deepEqual(checkAudit({ ...report, metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} }), {
    rejected: [],
  });
});
