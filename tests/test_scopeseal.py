import copy
import json

import pytest


CRITERIA = [
    {"id": "C1", "requirement": "The delivered release note must name the product ScopeSeal."},
    {"id": "C2", "requirement": "The release note must explain that missing evidence remains unresolved."},
]
DELIVERY = [{"label": "Complete release note", "text": "ScopeSeal records agreed scope. Missing evidence remains unresolved; it never becomes automatic approval."}]
REVIEW = [{"label": "Reviewer note", "text": "The supplied release note is the complete artifact for this agreement."}]


def finding(cid="C1", status="MET", quote="ScopeSeal records agreed scope."):
    return {"id": cid, "status": status, "citations": [{"source": "delivery", "item": 0, "quote": quote}]}


FINDINGS = [finding(), finding("C2", quote="Missing evidence remains unresolved")]


@pytest.fixture
def agreement(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    return direct_deploy("contracts/scopeseal.py", direct_bob, "ScopeSeal release note", json.dumps(CRITERIA))


@pytest.fixture
def sealed(agreement, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_bob
    agreement.accept_scope()
    agreement.submit_delivery(json.dumps(DELIVERY))
    direct_vm.sender = direct_alice
    agreement.seal_review(json.dumps(REVIEW))
    return agreement


def mock_findings(vm, value):
    vm.clear_mocks()
    # gltest 0.30.1 auto-decodes mock JSON; this preserves the SDK's text response.
    vm.mock_llm(r"SCOPESEAL_EVALUATE_V1", json.dumps(json.dumps(value)))


def test_complete_agreement(sealed, direct_vm):
    direct_vm.check_pickling = True
    mock_findings(direct_vm, FINDINGS)
    sealed.resolve()
    record = json.loads(sealed.get_record())
    assert record["phase"] == "RESOLVED"
    assert record["resolution"] == "SCOPE_MET"
    assert record["criteria"] == CRITERIA
    assert record["delivery"] == DELIVERY
    assert record["review"] == REVIEW
    assert record["findings"] == FINDINGS
    assert direct_vm.run_validator() is True


@pytest.mark.parametrize("method,args", [
    ("accept_scope", []), ("cancel_proposal", []),
    ("submit_delivery", [json.dumps(DELIVERY)]), ("seal_review", ["[]"]), ("resolve", []),
])
def test_outsider_cannot_mutate(agreement, direct_vm, direct_charlie, method, args):
    before = agreement.get_record()
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only"):
        getattr(agreement, method)(*args)
    assert agreement.get_record() == before


def test_provider_must_accept_before_delivery(agreement, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not active"):
        agreement.submit_delivery(json.dumps(DELIVERY))


def test_cancel_is_terminal(agreement, direct_vm, direct_bob):
    agreement.cancel_proposal()
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not awaiting acceptance"):
        agreement.accept_scope()
    assert json.loads(agreement.get_record())["phase"] == "CANCELLED"


def test_accepted_scope_cannot_be_cancelled(agreement, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_bob
    agreement.accept_scope()
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("cannot be cancelled"):
        agreement.cancel_proposal()


def test_frozen_evidence_cannot_be_replaced(sealed, direct_vm, direct_bob):
    before = sealed.get_record()
    with direct_vm.expect_revert("not awaiting review"):
        sealed.seal_review("[]")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not active"):
        sealed.submit_delivery(json.dumps(DELIVERY))
    assert sealed.get_record() == before


def test_resolve_requires_requester_seal(agreement, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    agreement.accept_scope()
    agreement.submit_delivery(json.dumps(DELIVERY))
    with direct_vm.expect_revert("not sealed"):
        agreement.resolve()


def test_resolution_cannot_be_replayed(sealed, direct_vm):
    mock_findings(direct_vm, FINDINGS)
    sealed.resolve()
    before = sealed.get_record()
    with direct_vm.expect_revert("already resolved"):
        sealed.resolve()
    assert sealed.get_record() == before


@pytest.mark.parametrize("status,expected", [("NOT_MET", "GAPS_FOUND"), ("INSUFFICIENT", "NEEDS_EVIDENCE")])
def test_non_passing_outcomes(sealed, direct_vm, status, expected):
    result = copy.deepcopy(FINDINGS)
    result[1]["status"] = status
    if status == "INSUFFICIENT":
        result[1]["citations"] = []
    mock_findings(direct_vm, result)
    sealed.resolve()
    assert json.loads(sealed.get_record())["resolution"] == expected


@pytest.mark.parametrize("mutation", ["verdict", "fabricated_quote", "unknown_id", "missing_criterion", "wrong_source", "bool_index", "empty_citations"])
def test_validator_rejects_malformed_or_disagreeing_leader(sealed, direct_vm, mutation):
    mock_findings(direct_vm, FINDINGS)
    sealed.resolve()
    candidate = copy.deepcopy(FINDINGS)
    if mutation == "verdict":
        candidate[0]["status"] = "NOT_MET"
    elif mutation == "fabricated_quote":
        candidate[0]["citations"][0]["quote"] = "This sentence does not exist."
    elif mutation == "unknown_id":
        candidate[0]["id"] = "FORGED"
    elif mutation == "missing_criterion":
        candidate.pop()
    elif mutation == "wrong_source":
        candidate[0]["citations"][0]["source"] = "review"
    elif mutation == "bool_index":
        candidate[0]["citations"][0]["item"] = False
    elif mutation == "empty_citations":
        candidate[0]["citations"] = []
    assert direct_vm.run_validator(leader_result=candidate) is False


def test_validator_independently_recomputes(sealed, direct_vm):
    mock_findings(direct_vm, FINDINGS)
    sealed.resolve()
    independent = copy.deepcopy(FINDINGS)
    independent[1] = {"id": "C2", "status": "INSUFFICIENT", "citations": []}
    mock_findings(direct_vm, independent)
    assert direct_vm.run_validator() is False


def test_validator_accepts_different_excerpt_of_same_support(sealed, direct_vm):
    mock_findings(direct_vm, FINDINGS)
    sealed.resolve()
    candidate = copy.deepcopy(FINDINGS)
    candidate[0]["citations"][0]["quote"] = "ScopeSeal records agreed scope"
    assert direct_vm.run_validator(leader_result=candidate) is True


def test_invalid_llm_output_does_not_resolve(sealed, direct_vm):
    before = sealed.get_record()
    direct_vm.mock_llm(r"SCOPESEAL_EVALUATE_V1", "This is not JSON")
    with pytest.raises(Exception):
        sealed.resolve()
    assert sealed.get_record() == before


def test_sdk_schema_covers_public_interface(agreement):
    from genlayer._internal.get_schema import get_schema

    schema = get_schema(type(agreement._instance))
    assert set(schema["methods"]) == {
        "accept_scope", "cancel_proposal", "submit_delivery", "seal_review", "resolve", "get_record"
    }


def test_validator_rejects_leader_error(sealed, direct_vm):
    mock_findings(direct_vm, FINDINGS)
    sealed.resolve()
    assert direct_vm.run_validator(leader_error=Exception("LLM unavailable")) is False


def test_requester_cannot_be_provider(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("different addresses"):
        direct_deploy("contracts/scopeseal.py", direct_alice, "Same party", json.dumps(CRITERIA))


def test_zero_provider_rejected(direct_vm, direct_deploy):
    with direct_vm.expect_revert("zero address"):
        direct_deploy("contracts/scopeseal.py", bytes(20), "Zero party", json.dumps(CRITERIA))


@pytest.mark.parametrize("rubric", [[], CRITERIA * 5, [CRITERIA[0], CRITERIA[0]], [{"id": "C1", "requirement": "short"}], [{"id": "C1", "requirement": "A real requirement", "extra": True}]])
def test_invalid_rubrics_rejected(direct_vm, direct_deploy, direct_bob, rubric):
    with pytest.raises(Exception):
        direct_deploy("contracts/scopeseal.py", direct_bob, "Example", json.dumps(rubric))


@pytest.mark.parametrize("evidence", [[], [{"label": "x", "text": "short"}], DELIVERY * 9, [{"label": "x", "text": "x" * 2001}]])
def test_evidence_bounds(agreement, direct_vm, direct_bob, evidence):
    direct_vm.sender = direct_bob
    agreement.accept_scope()
    with pytest.raises(Exception):
        agreement.submit_delivery(json.dumps(evidence))
    assert json.loads(agreement.get_record())["phase"] == "ACTIVE"
