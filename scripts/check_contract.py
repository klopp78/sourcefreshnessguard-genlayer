import importlib.util
import json
import pathlib
import sys
import types


ROOT = pathlib.Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "source_freshness_guard.py"
EXPECTED_DEPENDS = "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6"


class _Public:
    @staticmethod
    def view(fn):
        fn.__genlayer_visibility__ = "view"
        return fn

    @staticmethod
    def write(fn):
        fn.__genlayer_visibility__ = "write"
        return fn


class _Return:
    def __init__(self, value="{}"):
        self.value = value
        self.calldata = value


class _NondetWeb:
    calls = []

    @staticmethod
    def render(url, mode="text"):
        _NondetWeb.calls.append({"url": url, "mode": mode})
        fixtures = {
            "https://example.com/source/primary": "Portal contribution rules updated 2026-10-01 with weekly project spots.",
            "https://example.com/source/secondary": "Builder project rules current as of 2026-10-01; evidence required.",
            "https://example.com/source/reference": "GenLayer announcement references weekly submissions and current GLP season.",
            "https://example.com/source/observation": "Observed rule page is reachable, current, and consistent with source bundle.",
        }
        if url not in fixtures:
            raise AssertionError(f"unexpected web.render url: {url}")
        return fixtures[url]


class _Nondet:
    web = _NondetWeb()
    prompts = []

    @staticmethod
    def exec_prompt(prompt):
        _Nondet.prompts.append(prompt)
        return json.dumps(
            {
                "freshness_status": "fresh",
                "confidence": 91,
                "estimated_age_hours": "12",
                "staleness_breached": False,
                "sources_consistent": True,
                "tamper_risk": "low",
                "manual_review_required": False,
                "summary": "The rendered public sources are current, mutually consistent, and inside the staleness window.",
            },
            separators=(",", ":"),
        )


class _VM:
    Return = _Return

    @staticmethod
    def run_nondet_unsafe(leader_fn, validator_fn):
        value = leader_fn()
        if validator_fn(_Return(value)) is not True:
            raise AssertionError("validator rejected leader result")
        return value


class _Contract:
    pass


class _GL:
    Contract = _Contract
    public = _Public()
    vm = _VM()
    nondet = _Nondet()


class _DynArray(list):
    pass


class _TreeMap(dict):
    pass


def _install_genlayer_stub():
    module = types.ModuleType("genlayer")
    module.gl = _GL()
    module.DynArray = _DynArray
    module.TreeMap = _TreeMap
    module.u64 = int
    module.u8 = int
    sys.modules["genlayer"] = module


def _load_contract_module():
    spec = importlib.util.spec_from_file_location("source_freshness_guard", CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _fresh_contract(contract_cls):
    contract = contract_cls()
    contract.bundle_ids = _DynArray()
    contract.check_ids = _DynArray()
    contract.bundles = _TreeMap()
    contract.checks = _TreeMap()
    return contract


def main():
    source = CONTRACT_PATH.read_text(encoding="utf-8")
    if EXPECTED_DEPENDS not in source.splitlines()[0]:
        raise SystemExit(f"missing pinned runtime dependency: {EXPECTED_DEPENDS}")
    if "return int(gl.block.timestamp)" in source and "except Exception:" not in source:
        raise SystemExit("_now must tolerate runtimes without gl.block.timestamp")

    _install_genlayer_stub()
    module = _load_contract_module()
    contract_cls = module.SourceFreshnessGuard
    if not issubclass(contract_cls, _Contract):
        raise SystemExit("SourceFreshnessGuard must inherit gl.Contract")

    contract = _fresh_contract(contract_cls)
    required_methods = {
        "register_source_bundle": "write",
        "evaluate_freshness": "write",
        "get_source_bundle": "view",
        "get_freshness_check": "view",
        "get_bundle_count": "view",
        "get_latest_bundle_id": "view",
        "get_latest_check_id": "view",
        "list_bundle_ids": "view",
        "list_check_ids": "view",
    }
    for method_name, visibility in required_methods.items():
        method = getattr(contract, method_name, None)
        if method is None:
            raise SystemExit(f"missing method: {method_name}")
        actual = getattr(getattr(contract_cls, method_name), "__genlayer_visibility__", None)
        if actual != visibility:
            raise SystemExit(f"{method_name} must be public.{visibility}")

    _NondetWeb.calls = []
    _Nondet.prompts = []
    bundle_id = contract.register_source_bundle(
        "GenLayer portal contribution rules",
        "Weekly or announcement-driven updates",
        "https://example.com/source/primary",
        "https://example.com/source/secondary",
        "https://example.com/source/reference",
        "168",
    )
    if not bundle_id.startswith("bundle_"):
        raise SystemExit("register_source_bundle returned an invalid bundle id")
    bundle = json.loads(contract.get_source_bundle(bundle_id))
    if bundle["id"] != bundle_id:
        raise SystemExit("get_source_bundle did not return the registered bundle")
    if bundle["created_at"] != 0:
        raise SystemExit("_now fallback should be deterministic when gl.block is unavailable")
    if len(bundle["snapshot_commitments"]) != 3:
        raise SystemExit("bundle baseline must persist three source commitments")
    register_urls = [call["url"] for call in _NondetWeb.calls]
    for url in [
        "https://example.com/source/primary",
        "https://example.com/source/secondary",
        "https://example.com/source/reference",
    ]:
        if register_urls.count(url) != 2:
            raise SystemExit(f"register_source_bundle did not render {url} for leader and validator")

    check_id = contract.evaluate_freshness(
        bundle_id,
        "Weekly portal rule freshness check",
        "2026-10-01T00:00:00Z",
        "https://example.com/source/observation",
    )
    if not check_id.startswith("fresh_"):
        raise SystemExit("evaluate_freshness returned an invalid freshness id")
    report = json.loads(contract.get_freshness_check(check_id))
    if report["id"] != check_id or report["bundle_id"] != bundle_id:
        raise SystemExit("get_freshness_check did not return the accepted report")
    if report["staleness_breached"] is not False:
        raise SystemExit("evaluate_freshness normalized verdict incorrectly")
    if report["tamper_risk"] != "low":
        raise SystemExit("evaluate_freshness did not persist tamper risk")
    if len(report["snapshot_commitments"]) != 4:
        raise SystemExit("freshness check must persist four source commitments")
    comparison = report.get("central_comparison")
    if not comparison:
        raise SystemExit("freshness check must persist central source comparison")
    if len(comparison.get("pairwise_matrix", [])) != 6:
        raise SystemExit("central comparison must include every pairwise source comparison")
    if "quorum_inputs_hash" not in comparison or len(comparison["quorum_inputs_hash"]) != 64:
        raise SystemExit("central comparison must bind validator quorum inputs")
    if int(comparison.get("robustness_score", 0)) < 55:
        raise SystemExit("freshness comparison should produce a robust score for healthy fixtures")
    if report["created_at"] != 0:
        raise SystemExit("_now fallback should apply to freshness checks")
    if len([prompt for prompt in _Nondet.prompts if "source information is fresh" in prompt]) != 2:
        raise SystemExit("evaluate_freshness did not execute leader and validator LLM adjudication")

    try:
        contract.evaluate_freshness(
            "bundle_missing",
            "missing bundle check",
            "2026-10-01T00:00:00Z",
            "https://example.com/source/observation",
        )
    except Exception as exc:
        if "unknown_source_bundle" not in str(exc):
            raise
    else:
        raise SystemExit("evaluate_freshness must reject unknown bundles")

    print("SourceFreshnessGuard contract write-method E2E check passed")


if __name__ == "__main__":
    main()
