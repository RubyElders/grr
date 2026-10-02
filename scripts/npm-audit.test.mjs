import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAudit } from "./npm-audit.mjs";

const path = "node_modules/extract-zip";
const lock = { packages: { [path]: { version: "2.0.1", dev: true } } };
const report = {
  auditReportVersion: 2,
  metadata: { vulnerabilities: { total: 2 } },
  vulnerabilities: {
    "extract-zip": { nodes: [path], via: [{ url: "https://github.com/advisories/GHSA-jmr9-qjv8-65gv" }] },
    parent: { via: ["extract-zip"] },
  },
};

test("accepts only the exact reviewed development advisory", () => {
  assert.equal(checkAudit(report, lock).reviewed.length, 1);
  assert.deepEqual(checkAudit(report, lock).rejected, []);
  const changed = structuredClone(report);
  changed.vulnerabilities["extract-zip"].via[0].url = "https://github.com/advisories/GHSA-new";
  assert.equal(checkAudit(changed, lock).rejected.length, 1);
});

test("rejects production dependencies and changed versions", () => {
  for (const entry of [{ version: "2.0.1", dev: false }, { version: "2.0.2", dev: true }]) {
    assert.equal(checkAudit(report, { packages: { [path]: entry } }).rejected.length, 1);
  }
});

test("fails closed for incomplete or failed audit reports", () => {
  for (const invalid of [{}, { error: {} }, { ...report, vulnerabilities: {} }]) {
    assert.throws(() => checkAudit(invalid, lock));
  }
  const missing = structuredClone(report);
  missing.vulnerabilities.parent.via = ["missing"];
  assert.throws(() => checkAudit(missing, lock));
});

test("accepts a clean audit", () => {
  assert.deepEqual(checkAudit({ ...report, metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} }, lock), {
    reviewed: [], rejected: [],
  });
});
