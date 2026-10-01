import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync("contracts/source_freshness_guard.py", "utf8");

assert.match(source, /register_source_bundle/);
assert.match(source, /evaluate_freshness/);
assert.match(source, /bundle_/);
assert.match(source, /fresh_/);
assert.match(source, /primary_source/);
assert.match(source, /secondary_source/);
assert.match(source, /reference_source/);
assert.match(source, /observation_context/);
assert.match(source, /manual_review_required/);
assert.match(source, /tamper_risk/);
assert.match(source, /central_comparison/);
assert.match(source, /pairwise_matrix/);
assert.match(source, /robustness_score/);
assert.match(source, /quorum_inputs_hash/);

console.log("SourceFreshnessGuard lifecycle source check passed");
