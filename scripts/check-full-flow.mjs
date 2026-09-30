import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const bundleId = "bundle_7cf7a5d6b3de4fb64544";
const checkId = "fresh_96f9b78990ad7d7c5a66";

class StudioFlowSimulator {
  constructor() {
    this.calls = [];
    this.bundles = new Map();
    this.checks = new Map();
  }

  async writeContract({ functionName, args }) {
    this.calls.push({ kind: "write", functionName, args });
    if (functionName === "register_source_bundle") {
      const [subject, cadence, primary, secondary, reference, maxAge] = args;
      assert.match(subject, /GenLayer/);
      assert.match(cadence, /Weekly/);
      assert.match(primary, /^https:\/\//);
      assert.match(secondary, /^https:\/\//);
      assert.match(reference, /^https:\/\//);
      assert.equal(maxAge, "168");
      this.bundles.set(bundleId, {
        id: bundleId,
        subject,
        expected_update_cadence: cadence,
        max_staleness_hours: maxAge,
      });
      return "0xbundleregistration";
    }
    if (functionName === "evaluate_freshness") {
      const [incomingBundleId, label, observedAt, observationUrl] = args;
      assert.equal(incomingBundleId, bundleId);
      assert.match(label, /freshness check/);
      assert.match(observedAt, /2026/);
      assert.match(observationUrl, /^https:\/\//);
      assert.ok(this.bundles.has(bundleId));
      this.checks.set(checkId, {
        id: checkId,
        bundle_id: bundleId,
        freshness_status: "fresh",
        evidence_bundle_hash: "a".repeat(64),
      });
      return "0xfreshnesscheck";
    }
    throw new Error(`Unexpected write ${functionName}`);
  }

  async waitForTransactionReceipt({ hash }) {
    this.calls.push({ kind: "receipt", hash });
    if (hash === "0xbundleregistration") return { txExecutionResult: bundleId };
    if (hash === "0xfreshnesscheck") return { txExecutionResult: checkId };
    throw new Error(`Unknown transaction ${hash}`);
  }

  async readContract({ functionName, args }) {
    this.calls.push({ kind: "read", functionName, args });
    if (functionName === "get_source_bundle") return JSON.stringify(this.bundles.get(args[0]) ?? {});
    if (functionName === "get_freshness_check") return JSON.stringify(this.checks.get(args[0]) ?? {});
    throw new Error(`Unexpected read ${functionName}`);
  }
}

function receiptString(receipt, pattern, label) {
  const value = Object.values(receipt).find(
    (candidate) => typeof candidate === "string" && pattern.test(candidate),
  );
  assert.ok(value, `Accepted ${label} receipt must contain its returned identifier`);
  return value;
}

async function runFullFlow(client) {
  const bundleHash = await client.writeContract({
    functionName: "register_source_bundle",
    args: [
      "GenLayer portal contribution rules",
      "Weekly or announcement-driven updates",
      "https://portal.genlayer.foundation/",
      "https://docs.genlayer.com/",
      "https://x.com/GenLayer",
      "168",
    ],
  });
  const bundleReceipt = await client.waitForTransactionReceipt({ hash: bundleHash });
  const returnedBundleId = receiptString(bundleReceipt, /^bundle_[a-f0-9]{20}$/, "source bundle");
  const bundle = JSON.parse(await client.readContract({ functionName: "get_source_bundle", args: [returnedBundleId] }));
  assert.equal(bundle.id, returnedBundleId);

  const checkHash = await client.writeContract({
    functionName: "evaluate_freshness",
    args: [
      returnedBundleId,
      "Weekly portal rule freshness check",
      "2026-10-01T00:00:00Z",
      "https://portal.genlayer.foundation/community/all-contributions",
    ],
  });
  const checkReceipt = await client.waitForTransactionReceipt({ hash: checkHash });
  const returnedCheckId = receiptString(checkReceipt, /^fresh_[a-f0-9]{20}$/, "freshness check");
  const check = JSON.parse(await client.readContract({ functionName: "get_freshness_check", args: [returnedCheckId] }));
  assert.equal(check.id, returnedCheckId);
  assert.equal(check.bundle_id, returnedBundleId);
  return { returnedBundleId, returnedCheckId };
}

const simulator = new StudioFlowSimulator();
const outcome = await runFullFlow(simulator);
assert.deepEqual(
  simulator.calls.map((call) => `${call.kind}:${call.functionName ?? call.hash}`),
  [
    "write:register_source_bundle",
    "receipt:0xbundleregistration",
    "read:get_source_bundle",
    "write:evaluate_freshness",
    "receipt:0xfreshnesscheck",
    "read:get_freshness_check",
  ],
);
assert.equal(outcome.returnedBundleId, bundleId);
assert.equal(outcome.returnedCheckId, checkId);

const pythonRunners = [
  process.env.PYTHON,
  ...(process.platform === "win32" ? ["python", "py"] : ["python3", "python"]),
].filter(Boolean);
let contractCheck;
let lastError = "";
for (const runner of pythonRunners) {
  contractCheck = spawnSync(runner, ["scripts/check_contract.py"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (contractCheck.status === 0) break;
  lastError = `${runner}: ${contractCheck.error?.message || contractCheck.stderr || contractCheck.stdout}`;
}

assert.equal(
  contractCheck?.status,
  0,
  `contract write-method E2E flow failed:\n${lastError}`,
);

console.log("SourceFreshnessGuard full-flow check passed: client sequence plus contract write-method E2E");
