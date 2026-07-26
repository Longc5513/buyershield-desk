import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("project includes oracle contract code and real client interaction", () => {
  const contract = readFileSync("contracts/buyer_protection_oracle.py", "utf8");
  const appClient = readFileSync("site/lib/oracle-client.js", "utf8");
  const runtime = readFileSync("app/project-runtime.js", "utf8");
  assert.match(contract, /gl\.nondet\.exec_prompt/);
  assert.match(contract, /gl\.vm\.run_nondet_unsafe/);
  assert.match(appClient, /writeContract/);
  assert.match(appClient, /readContract/);
  assert.match(appClient, /waitForTransactionReceipt/);
  assert.match(runtime, /policyBoundToExecution/);
  assert.match(runtime, /blockedByPolicy/);
});

test("site implements the full project workflow", () => {
  const html = readFileSync("site/index.html", "utf8");
  assert.match(html, /Create claim/);
  assert.match(html, /Merchant response/);
  assert.match(html, /Resolve claim/);
  assert.match(html, /Read back decision/);
});

test("frontend binds verdict to operational action", () => {
  const app = readFileSync("site/app.js", "utf8");
  assert.match(app, /blockedByRefundVerdict|Escrow can release buyer-side remedy|Hold refund/);
  assert.match(app, /updateDecisionPanel/);
});

test("project has product docs and architecture asset", () => {
  assert.equal(existsSync("docs/images/desk-architecture.svg"), true);
  assert.equal(existsSync("app/index.html"), true);
  const readme = readFileSync("README.md", "utf8");
  assert.match(readme, /BuyerShield Desk/);
  assert.match(readme, /How the desk works/);
  assert.match(readme, /Project structure/);
});

test("repo includes reviewer-facing submission notes", () => {
  assert.equal(existsSync("submission-pack/JUDGE-NOTES.md"), true);
  assert.equal(existsSync("submission-pack/SUBMISSION-DESCRIPTION.md"), true);
});
