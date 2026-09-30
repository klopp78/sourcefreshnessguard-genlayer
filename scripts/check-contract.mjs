import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const contractPath = resolve("contracts/source_freshness_guard.py");
const source = readFileSync(contractPath, "utf8");
const firstLine = source.split(/\r?\n/, 1)[0];
const expectedRuntime =
  "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

assert(firstLine.includes(expectedRuntime), `missing pinned runtime dependency: ${expectedRuntime}`);
assert(/class\s+SourceFreshnessGuard\s*\(\s*gl\.Contract\s*\)\s*:/.test(source), "SourceFreshnessGuard must inherit gl.Contract");
assert(!/class\s+SourceFreshnessGuard\s*\(\s*Contract\s*\)\s*:/.test(source), "undefined Contract base remains");
assert(!/gl\.get_webpage|gl\.exec_prompt|gl\.json_loads|gl\.json_dumps|gl\.msg/.test(source), "unsupported legacy gl APIs remain");

for (const method of [
  "register_source_bundle",
  "evaluate_freshness",
  "get_bundle_count",
  "get_latest_bundle_id",
  "get_latest_check_id",
  "get_source_bundle",
  "get_freshness_check",
  "list_bundle_ids",
  "list_check_ids",
]) {
  assert(new RegExp(`def\\s+${method}\\s*\\(`).test(source), `missing method: ${method}`);
}

for (const method of ["register_source_bundle", "evaluate_freshness"]) {
  assert(new RegExp(`@gl\\.public\\.write\\s+def\\s+${method}\\s*\\(`, "s").test(source), `${method} must be decorated with @gl.public.write`);
}

for (const method of ["get_source_bundle", "get_freshness_check", "list_bundle_ids", "list_check_ids"]) {
  assert(new RegExp(`@gl\\.public\\.view\\s+def\\s+${method}\\s*\\(`, "s").test(source), `${method} must be decorated with @gl.public.view`);
}

assert(/gl\.vm\.run_nondet_unsafe/.test(source), "missing GenLayer nondeterministic consensus gate");
assert(/gl\.nondet\.web\.render/.test(source), "missing GenLayer web render call");
assert(/gl\.nondet\.exec_prompt/.test(source), "missing GenLayer prompt call");
assert(/snapshot_commitments/.test(source), "contract must persist snapshot commitments");
assert(/evidence_bundle_hash/.test(source), "contract must persist evidence bundle hash");
assert(/staleness_breached/.test(source), "contract must bind staleness decision");
assert(/tamper_risk/.test(source), "contract must store tamper risk");

const bundleId = `bundle_${sha256("GenLayer portal contribution rules|baseline").slice(0, 20)}`;
const checkId = `fresh_${sha256(`${bundleId}|Weekly portal rule freshness check|bundle`).slice(0, 20)}`;
assert(/^bundle_[a-f0-9]{20}$/.test(bundleId), "bundle id format check failed");
assert(/^fresh_[a-f0-9]{20}$/.test(checkId), "freshness id format check failed");

console.log("SourceFreshnessGuard contract check passed");
