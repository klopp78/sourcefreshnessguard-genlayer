# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import hashlib
import json
import typing


class SourceFreshnessGuard(gl.Contract):
    """Consensus registry for public source freshness and provenance checks."""

    bundle_count: u64
    latest_bundle_id: str
    latest_check_id: str
    bundle_ids: DynArray[str]
    check_ids: DynArray[str]
    bundles: TreeMap[str, str]
    checks: TreeMap[str, str]

    def __init__(self):
        self.bundle_count = u64(0)
        self.latest_bundle_id = ""
        self.latest_check_id = ""

    @gl.public.view
    def get_bundle_count(self) -> u64:
        return self.bundle_count

    @gl.public.view
    def get_latest_bundle_id(self) -> str:
        return self.latest_bundle_id

    @gl.public.view
    def get_latest_check_id(self) -> str:
        return self.latest_check_id

    @gl.public.view
    def get_source_bundle(self, bundle_id: str) -> str:
        return self.bundles.get(bundle_id, "")

    @gl.public.view
    def get_freshness_check(self, check_id: str) -> str:
        return self.checks.get(check_id, "")

    @gl.public.view
    def list_bundle_ids(self) -> str:
        return json.dumps([bundle_id for bundle_id in self.bundle_ids], separators=(",", ":"))

    @gl.public.view
    def list_check_ids(self) -> str:
        return json.dumps([check_id for check_id in self.check_ids], separators=(",", ":"))

    @gl.public.write
    def register_source_bundle(
        self,
        subject: str,
        expected_update_cadence: str,
        primary_source_url: str,
        secondary_source_url: str,
        reference_source_url: str,
        max_staleness_hours: str,
    ) -> str:
        clean_subject = _clean_text(subject, 100, "subject_required")
        cadence = _clean_text(expected_update_cadence, 80, "cadence_required")
        staleness = _clean_integer(max_staleness_hours, 1, 100000, "invalid_staleness_window")
        sources = [
            _source("primary_source", primary_source_url),
            _source("secondary_source", secondary_source_url),
            _source("reference_source", reference_source_url),
        ]

        def leader_fn():
            snapshots = _render_sources(sources)
            return json.dumps(_baseline(clean_subject, cadence, staleness, snapshots), separators=(",", ":"))

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                leader = json.loads(leader_result.value)
                local = _baseline(clean_subject, cadence, staleness, _render_sources(sources))
                return _baseline_equal(leader, local)
            except Exception:
                return False

        baseline = json.loads(gl.vm.run_nondet_unsafe(leader_fn, validator_fn))
        bundle_id = _bundle_id(clean_subject, baseline["baseline_hash"])
        if len(self.bundles.get(bundle_id, "")) > 0:
            raise Exception("source_bundle_already_registered")

        record = {
            "id": bundle_id,
            "subject": clean_subject,
            "expected_update_cadence": cadence,
            "max_staleness_hours": staleness,
            "source_urls": [item["canonical_url"] for item in sources],
            "baseline_hash": baseline["baseline_hash"],
            "snapshot_commitments": baseline["snapshot_commitments"],
            "created_at": _now(),
        }
        self.bundles[bundle_id] = json.dumps(record, separators=(",", ":"))
        self.bundle_ids.append(bundle_id)
        self.latest_bundle_id = bundle_id
        self.bundle_count = u64(int(self.bundle_count) + 1)
        return bundle_id

    @gl.public.write
    def evaluate_freshness(
        self,
        bundle_id: str,
        observation_label: str,
        observed_at: str,
        observation_url: str,
    ) -> str:
        normalized_bundle_id = _clean_id(bundle_id, "bundle_id_required")
        bundle_json = self.bundles.get(normalized_bundle_id, "")
        if len(bundle_json) == 0:
            raise Exception("unknown_source_bundle")
        bundle = json.loads(bundle_json)
        label = _clean_text(observation_label, 120, "observation_label_required")
        timestamp = _clean_text(observed_at, 80, "observed_at_required")
        observed_url = _canonical_url(observation_url, "observation_url_required")
        sources = [
            _source("primary_source", bundle["source_urls"][0]),
            _source("secondary_source", bundle["source_urls"][1]),
            _source("reference_source", bundle["source_urls"][2]),
            _source("observation_context", observed_url),
        ]

        def leader_fn():
            snapshots = _render_sources(sources)
            verdict = _judge_freshness(bundle, label, timestamp, snapshots)
            return json.dumps(verdict, separators=(",", ":"))

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                leader = json.loads(leader_result.value)
                local = _judge_freshness(bundle, label, timestamp, _render_sources(sources))
                return _verdict_equal(leader, local)
            except Exception:
                return False

        verdict = json.loads(gl.vm.run_nondet_unsafe(leader_fn, validator_fn))
        check_id = _check_id(normalized_bundle_id, label, verdict["evidence_bundle_hash"])
        if len(self.checks.get(check_id, "")) > 0:
            raise Exception("freshness_check_already_exists")

        record = {
            "id": check_id,
            "bundle_id": normalized_bundle_id,
            "subject": bundle["subject"],
            "observation_label": label,
            "observed_at": timestamp,
            "observation_url": observed_url,
            "freshness_status": verdict["freshness_status"],
            "confidence": verdict["confidence"],
            "estimated_age_hours": verdict["estimated_age_hours"],
            "staleness_breached": verdict["staleness_breached"],
            "sources_consistent": verdict["sources_consistent"],
            "tamper_risk": verdict["tamper_risk"],
            "manual_review_required": verdict["manual_review_required"],
            "evidence_bundle_hash": verdict["evidence_bundle_hash"],
            "assessment_context_hash": verdict["assessment_context_hash"],
            "snapshot_commitments": json.loads(verdict["snapshot_commitments_json"]),
            "central_comparison": json.loads(verdict["central_comparison_json"]),
            "summary": verdict["summary"],
            "created_at": _now(),
        }
        self.checks[check_id] = json.dumps(record, separators=(",", ":"))
        self.check_ids.append(check_id)
        self.latest_check_id = check_id
        return check_id


def _baseline(subject: str, cadence: str, staleness: str, snapshots: typing.Sequence[dict]) -> dict:
    commitments = _commitments(snapshots)
    payload = {
        "subject": subject,
        "expected_update_cadence": cadence,
        "max_staleness_hours": staleness,
        "snapshot_commitments": commitments,
    }
    return {"baseline_hash": _sha256(_canonical_json(payload)), "snapshot_commitments": commitments}


def _judge_freshness(bundle: dict, label: str, observed_at: str, snapshots: typing.Sequence[dict]) -> dict:
    commitments = _commitments(snapshots)
    central_comparison = _central_comparison(bundle, observed_at, snapshots, commitments)
    context = {
        "bundle_id": bundle["id"],
        "subject": bundle["subject"],
        "expected_update_cadence": bundle["expected_update_cadence"],
        "max_staleness_hours": bundle["max_staleness_hours"],
        "observation_label": label,
        "observed_at": observed_at,
        "snapshot_commitments": commitments,
        "central_comparison": central_comparison,
    }
    prompt = f"""
You are a GenLayer validator checking whether public source information is fresh.

Read the rendered source snapshots and the deterministic central comparison.
Use the pairwise matrix, source health, extracted date hints, baseline drift,
and robustness score as the primary evidence. Decide whether the subject looks
fresh, stale, changed, risky, or inconclusive.

Return only minified JSON with keys: freshness_status, confidence,
estimated_age_hours, staleness_breached, sources_consistent, tamper_risk,
manual_review_required, summary.
freshness_status must be fresh, stale, changed, risky, or inconclusive.
tamper_risk must be low, medium, high, or unknown.

Source bundle context:
{_canonical_json(context)}

Rendered source snapshots:
{_canonical_json(snapshots)}
"""
    data = json.loads(gl.nondet.exec_prompt(prompt))
    normalized = {
        "freshness_status": _bounded_choice(str(data["freshness_status"]).lower(), ["fresh", "stale", "changed", "risky", "inconclusive"]),
        "confidence": int(_bounded_u8(data["confidence"])),
        "estimated_age_hours": _clean_integer(str(data["estimated_age_hours"]), 0, 1000000, "invalid_estimated_age"),
        "staleness_breached": bool(data["staleness_breached"]),
        "sources_consistent": bool(data["sources_consistent"]),
        "tamper_risk": _bounded_choice(str(data["tamper_risk"]).lower(), ["low", "medium", "high", "unknown"]),
        "manual_review_required": bool(data["manual_review_required"]),
        "summary": _clean_text(str(data["summary"]), 280, "summary_required"),
    }
    readable_count = int(central_comparison["readable_source_count"])
    if readable_count < 3 or int(central_comparison["robustness_score"]) < 55:
        normalized["freshness_status"] = "inconclusive"
        normalized["tamper_risk"] = "unknown"
        normalized["manual_review_required"] = True
        normalized["confidence"] = min(int(normalized["confidence"]), int(central_comparison["robustness_score"]))
    max_age = int(bundle["max_staleness_hours"])
    observed_age = int(normalized["estimated_age_hours"])
    if observed_age > max_age:
        normalized["staleness_breached"] = True
        if normalized["freshness_status"] == "fresh":
            normalized["freshness_status"] = "stale"
    if central_comparison["baseline_drift_detected"] is True:
        normalized["sources_consistent"] = False
        normalized["manual_review_required"] = True
        if normalized["freshness_status"] == "fresh":
            normalized["freshness_status"] = "changed"
    if int(central_comparison["contradiction_count"]) > 0:
        normalized["sources_consistent"] = False
        normalized["manual_review_required"] = True
        if normalized["tamper_risk"] == "low":
            normalized["tamper_risk"] = "medium"
    if normalized["freshness_status"] in ["stale", "changed", "risky"] and not normalized["manual_review_required"]:
        normalized["manual_review_required"] = True

    bundle_payload = {"context": context, "central_comparison": central_comparison, "normalized": normalized}
    normalized["evidence_bundle_hash"] = _sha256(_canonical_json(bundle_payload))
    normalized["assessment_context_hash"] = _sha256(_canonical_json(context))
    normalized["snapshot_commitments_json"] = json.dumps(commitments, separators=(",", ":"))
    normalized["central_comparison_json"] = json.dumps(central_comparison, separators=(",", ":"))
    return normalized


def _render_sources(sources: typing.Sequence[dict]) -> typing.Sequence[dict]:
    snapshots = []
    for source in sources:
        try:
            rendered_text = gl.nondet.web.render(source["canonical_url"], mode="text")[:6000]
            fetch_error = ""
        except Exception as error:
            rendered_text = ""
            fetch_error = str(error)[:240]
        snapshots.append(
            {
                "role": source["role"],
                "canonical_url": source["canonical_url"],
                "snapshot_hash": _sha256(rendered_text) if len(rendered_text) > 0 else "",
                "snapshot_excerpt": rendered_text[:700],
                "fetch_error": fetch_error,
            }
        )
    return snapshots


def _commitments(snapshots: typing.Sequence[dict]) -> typing.Sequence[dict]:
    return [
        {
            "role": item["role"],
            "canonical_url": item["canonical_url"],
            "snapshot_hash": item.get("snapshot_hash", ""),
            "fetch_error_hash": _sha256(item.get("fetch_error", "")) if item.get("fetch_error", "") else "",
        }
        for item in snapshots
    ]


def _central_comparison(bundle: dict, observed_at: str, snapshots: typing.Sequence[dict], commitments: typing.Sequence[dict]) -> dict:
    metrics = [_source_metrics(item) for item in snapshots]
    pairs = []
    contradictions = 0
    corroborations = 0
    for left_index in range(len(metrics)):
        for right_index in range(left_index + 1, len(metrics)):
            pair = _pairwise_comparison(metrics[left_index], metrics[right_index])
            pairs.append(pair)
            contradictions += int(pair["contradiction_detected"])
            corroborations += int(pair["corroborates"])

    readable_count = sum(1 for item in metrics if item["readable"])
    baseline_hashes = [item.get("snapshot_hash", "") for item in bundle.get("snapshot_commitments", [])]
    current_hashes = [item.get("snapshot_hash", "") for item in commitments[:3]]
    drift_detected = _canonical_json(baseline_hashes) != _canonical_json(current_hashes)
    date_signal_count = sum(int(item["date_signal_count"]) for item in metrics)
    shared_topic_count = sum(int(pair["shared_topic_count"]) for pair in pairs)
    health_score = min(100, readable_count * 18 + corroborations * 8 + min(date_signal_count, 12) * 2 + min(shared_topic_count, 10))
    if contradictions > 0:
        health_score = max(0, health_score - contradictions * 15)
    if drift_detected:
        health_score = max(0, health_score - 12)
    if readable_count < 3:
        health_score = min(health_score, 45)

    comparison_payload = {
        "bundle_id": bundle["id"],
        "observed_at": observed_at,
        "source_metrics": metrics,
        "pairwise_matrix": pairs,
        "readable_source_count": readable_count,
        "contradiction_count": contradictions,
        "corroboration_count": corroborations,
        "baseline_drift_detected": drift_detected,
        "date_signal_count": date_signal_count,
        "robustness_score": health_score,
    }
    comparison_payload["quorum_inputs_hash"] = _sha256(_canonical_json({
        "commitments": commitments,
        "metrics": metrics,
        "pairs": pairs,
        "baseline_hashes": baseline_hashes,
    }))
    return comparison_payload


def _source_metrics(snapshot: dict) -> dict:
    excerpt = snapshot.get("snapshot_excerpt", "")
    lower = excerpt.lower()
    tokens = _topic_tokens(lower)
    date_signals = _date_signals(excerpt)
    freshness_terms = sum(1 for word in ["updated", "current", "latest", "today", "weekly", "2026"] if word in lower)
    stale_terms = sum(1 for word in ["deprecated", "archived", "outdated", "removed", "expired", "error"] if word in lower)
    return {
        "role": snapshot["role"],
        "canonical_url": snapshot["canonical_url"],
        "snapshot_hash": snapshot.get("snapshot_hash", ""),
        "readable": len(snapshot.get("snapshot_hash", "")) == 64,
        "content_length": len(excerpt),
        "date_signal_count": len(date_signals),
        "date_signal_hash": _sha256("|".join(date_signals)) if len(date_signals) > 0 else "",
        "freshness_term_count": freshness_terms,
        "stale_term_count": stale_terms,
        "topic_fingerprint": _sha256("|".join(tokens)) if len(tokens) > 0 else "",
        "topics": tokens[:10],
        "fetch_error_hash": _sha256(snapshot.get("fetch_error", "")) if snapshot.get("fetch_error", "") else "",
    }


def _pairwise_comparison(left: dict, right: dict) -> dict:
    shared_topics = sorted([token for token in left["topics"] if token in right["topics"]])
    both_readable = bool(left["readable"]) and bool(right["readable"])
    contradiction = both_readable and (
        (int(left["freshness_term_count"]) > 0 and int(right["stale_term_count"]) > 0)
        or (int(right["freshness_term_count"]) > 0 and int(left["stale_term_count"]) > 0)
    )
    corroborates = both_readable and len(shared_topics) >= 2 and contradiction is False
    return {
        "left_role": left["role"],
        "right_role": right["role"],
        "both_readable": both_readable,
        "shared_topic_count": len(shared_topics),
        "shared_topic_hash": _sha256("|".join(shared_topics)) if len(shared_topics) > 0 else "",
        "date_signals_match": left["date_signal_hash"] == right["date_signal_hash"] and left["date_signal_hash"] != "",
        "contradiction_detected": contradiction,
        "corroborates": corroborates,
    }


def _topic_tokens(value: str) -> typing.Sequence[str]:
    normalized = ""
    for char in value:
        normalized += char if char.isalnum() else " "
    ignored = {
        "about", "after", "also", "and", "are", "but", "for", "from", "has", "have", "into",
        "not", "that", "the", "this", "with", "your", "https", "www", "com", "org",
    }
    tokens = []
    for token in normalized.split():
        if len(token) < 4 or token in ignored:
            continue
        if token not in tokens:
            tokens.append(token[:32])
    return tokens[:40]


def _date_signals(value: str) -> typing.Sequence[str]:
    signals = []
    clean = value.replace("/", "-").replace(".", "-")
    parts = clean.split()
    for part in parts:
        candidate = part.strip(",:;()[]{}")
        if len(candidate) >= 10 and candidate[0:4].isdigit() and candidate[4] == "-" and candidate[5:7].isdigit():
            signals.append(candidate[:10])
        if len(candidate) >= 8 and candidate[-4:].isdigit() and candidate[-4:].startswith("20"):
            signals.append(candidate[-4:])
    return sorted(list(dict.fromkeys(signals)))[:20]


def _baseline_equal(a: dict, b: dict) -> bool:
    return a["baseline_hash"] == b["baseline_hash"] and _canonical_json(a["snapshot_commitments"]) == _canonical_json(b["snapshot_commitments"])


def _verdict_equal(a: dict, b: dict) -> bool:
    keys = [
        "freshness_status",
        "confidence",
        "estimated_age_hours",
        "staleness_breached",
        "sources_consistent",
        "tamper_risk",
        "manual_review_required",
        "evidence_bundle_hash",
        "assessment_context_hash",
        "snapshot_commitments_json",
        "central_comparison_json",
    ]
    return all(a[key] == b[key] for key in keys)


def _source(role: str, url: str) -> dict:
    return {"role": role, "canonical_url": _canonical_url(url, f"{role}_url_required")}


def _bundle_id(subject: str, baseline_hash: str) -> str:
    return "bundle_" + _sha256(subject + "|" + baseline_hash)[:20]


def _check_id(bundle_id: str, label: str, bundle_hash: str) -> str:
    return "fresh_" + _sha256(bundle_id + "|" + label + "|" + bundle_hash)[:20]


def _canonical_url(value: str, error: str) -> str:
    clean = str(value).strip()
    if not (clean.startswith("https://") and len(clean) <= 280):
        raise Exception(error)
    return clean


def _clean_id(value: str, error: str) -> str:
    clean = str(value).strip()
    if len(clean) < 8 or len(clean) > 80:
        raise Exception(error)
    return clean


def _clean_text(value: str, max_length: int, error: str) -> str:
    clean = " ".join(str(value).strip().split())
    if len(clean) == 0 or len(clean) > max_length:
        raise Exception(error)
    return clean


def _clean_integer(value: str, minimum: int, maximum: int, error: str) -> str:
    clean = str(value).strip()
    if len(clean) == 0 or len(clean) > 12:
        raise Exception(error)
    integer = int(clean)
    if integer < minimum or integer > maximum:
        raise Exception(error)
    return str(integer)


def _bounded_choice(value: str, choices: typing.Sequence[str]) -> str:
    if value not in choices:
        return choices[-1]
    return value


def _bounded_u8(value) -> u8:
    integer = int(value)
    if integer < 0:
        integer = 0
    if integer > 100:
        integer = 100
    return u8(integer)


def _canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _now() -> int:
    try:
        return int(gl.block.timestamp)
    except Exception:
        return 0
