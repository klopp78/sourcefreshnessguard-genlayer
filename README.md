# SourceFreshnessGuard for GenLayer

SourceFreshnessGuard is a GenLayer Project for checking whether public evidence
sources are current, consistent, and safe to rely on. It lets a team register a
source bundle, ask validators to render independent public pages, and store a
freshness receipt when a source looks stale, changed, risky, or inconclusive.

## Live Demo

- App: https://sourcefreshnessguard-genlayer.galaxthoo.chatgpt.site
- GitHub repo: https://github.com/klopp78/sourcefreshnessguard-genlayer
- Contract source: `contracts/source_freshness_guard.py`
- Studio contract: https://explorer-studio.genlayer.com/address/0x29bA75C8bE8A62C2A2f93b7ed7C8BE61e4a774C2

The app defaults to the deployed contract address and can be overridden with
`NEXT_PUBLIC_SOURCE_FRESHNESS_GUARD_CONTRACT_ADDRESS`.

## Product Flow

1. Register a source bundle with a subject, update cadence, staleness window,
   and three public source URLs.
2. Submit a freshness check for a `bundle_*` ID with an observation label,
   timestamp, and observation URL.
3. GenLayer validators render all registered sources and the observation page.
4. The contract stores a `fresh_*` receipt with freshness status, confidence,
   estimated age, source consistency, tamper risk, snapshot commitments, and
   evidence bundle hashes.
5. The records page reads `bundle_*` and `fresh_*` records directly from the
   deployed contract.

## Steward Fix: Central Comparison and Robustness

The v2 contract strengthens the review request around central freshness
comparison and consensus robustness:

- validators recompute source metrics for every rendered page
- every `fresh_*` receipt stores a pairwise `central_comparison.pairwise_matrix`
  across primary, secondary, reference, and observation sources
- the contract derives `readable_source_count`, `contradiction_count`,
  `corroboration_count`, `baseline_drift_detected`, and `robustness_score`
  before the LLM explanation is accepted
- `quorum_inputs_hash` binds commitments, metrics, pairwise comparisons, and
  baseline hashes so the stored receipt is tied to what validators compared
- low robustness, source drift, or contradictions force manual review and can
  downgrade an apparently fresh result

## Why This Fits GenLayer

Source freshness is not a deterministic string check. Public pages can be stale,
silently edited, rate-limited, incomplete, or inconsistent with related sources.
A useful answer requires live web reads, interpretation of public evidence, and
an auditable consensus receipt.

GenLayer is used for:

- nondeterministic web rendering of public evidence sources
- consensus over whether sources are fresh, stale, changed, or risky
- deterministic central source comparison before the final freshness verdict
- persistent `bundle_*` and `fresh_*` records
- compact snapshot commitments instead of storing full rendered pages

## Contract

```text
contracts/source_freshness_guard.py
```

Runtime pin:

```python
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
```

Main write methods:

```python
register_source_bundle(
    subject,
    expected_update_cadence,
    primary_source_url,
    secondary_source_url,
    reference_source_url,
    max_staleness_hours,
) -> str

evaluate_freshness(
    bundle_id,
    observation_label,
    observed_at,
    observation_url,
) -> str
```

Main read methods:

```python
get_bundle_count()
get_latest_bundle_id()
get_latest_check_id()
get_source_bundle(bundle_id)
get_freshness_check(check_id)
list_bundle_ids()
list_check_ids()
```

## Example Inputs

```text
Subject: GenLayer portal contribution rules
Expected cadence: Weekly or announcement-driven updates
Primary: https://portal.genlayer.foundation/
Secondary: https://docs.genlayer.com/
Reference: https://x.com/GenLayer
Max staleness: 168 hours
Observation: https://portal.genlayer.foundation/community/all-contributions
```

## Run Locally

```bash
npm install
npm run contract:check
npm run contract:test
npm run flow:check
npm run build
```

`npm run flow:check` verifies two layers. First, it checks the browser/client
sequence: source bundle registration, accepted receipt parsing, exact bundle
readback, freshness evaluation, accepted receipt parsing, and exact check
readback. Second, it loads `contracts/source_freshness_guard.py` with a
GenLayer runtime stub and actually executes both write methods,
`register_source_bundle` and `evaluate_freshness`, against mocked
`gl.nondet.web.render` and `gl.nondet.exec_prompt` calls. That contract-level
path verifies the `_now()` fallback for runtimes without `gl.block.timestamp`,
confirms leader and validator source renders, persists baseline and freshness
snapshot commitments, persists central pairwise comparison and robustness
fields, rejects unknown bundles, and reads both accepted records back by
returned ID. Set `PYTHON` to a Python 3 interpreter path if it is not available
as `python3`, `python`, or `py`.
