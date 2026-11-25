# ScopeSeal

ScopeSeal is a standalone GenLayer contract for reviewing a written deliverable against a scope agreed by two wallet addresses. It keeps the scope, submitted artifact text, reviewer evidence, and criterion-level findings in one immutable record after resolution.

The useful boundary is a **frozen evidence packet**. The requester cannot change the criteria after deployment. The provider must accept before delivering. Neither party can replace submitted evidence. Resolution is available only after the requester has sealed a response, and either party can then request it once.

## State and authority

| Phase | Allowed action | Caller | Next phase |
| --- | --- | --- | --- |
| PROPOSED | `accept_scope()` | Provider | ACTIVE |
| PROPOSED | `cancel_proposal()` | Requester | CANCELLED |
| ACTIVE | `submit_delivery(evidence_json)` | Provider | DELIVERED |
| DELIVERED | `seal_review(evidence_json)` | Requester | SEALED |
| SEALED | `resolve()` | Either party | RESOLVED, if execution succeeds |

There is no administrator override or criterion-edit method. `get_record()` exposes the complete record as JSON. The contract holds no escrow and transfers no tokens.

Every criterion is mandatory:

- `SCOPE_MET`: all criteria are `MET`.
- `GAPS_FOUND`: at least one criterion is `NOT_MET`; other unknowns remain visible.
- `NEEDS_EVIDENCE`: no demonstrated failure, but at least one `INSUFFICIENT` finding.

Missing evidence cannot become approval. Missing proof alone also cannot become a demonstrated failure.

## Consensus

The contract pins the Python runner used by Studio's v0.4 templates. In that SDK the custom leader/validator API is `gl.vm.run_nondet`; some documentation for older runners calls it `run_nondet_unsafe`.

1. The leader evaluates the immutable criteria and both evidence packets with an LLM.
2. Deterministic checks require one finding per criterion, a permitted status, bounded citations, valid evidence indices, and exact quoted substrings. Conclusive findings require citations.
3. Each validator independently reruns the evaluation from the same packet. It rejects errors, malformed proposals, different criterion verdicts, or different sets of cited evidence items.
4. Only the accepted result changes application storage. The final resolution is derived in Python, not selected by the LLM.

Validators may accept different excerpts within the same agreed supporting items. The contract verifies substring membership, not a formal proof of entailment. Semantic judgment still depends on the models and consensus. The comparison deliberately uses exact verdicts and evidence-item sets: disagreement may prevent finalization rather than weaken the decision rule.

See GenLayer's [equivalence principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle) and [development setup](https://docs.genlayer.com/developers/intelligent-contracts/tooling-setup).

## Reproduce verification

Use Linux or WSL, Python 3.14, and a virtual environment:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export GENVM_VERSION=v0.6.0-rc17
genvm-lint lint contracts/scopeseal.py --json
pytest -q
```

The first direct run downloads the official GenVM runner bundle. Tests execute the actual pinned Python SDK, storage descriptors, and calldata round trips. Mock LLM responses make protocol tests reproducible. Separate tests invoke captured validator callbacks with forged or disagreeing results; direct mode alone does not run a distributed validator network.

Coverage includes the full workflow, caller restrictions, proposal cancellation, frozen evidence, review gating, duplicate resolution, missing evidence, fabricated quotations, altered verdicts, invalid evidence references, malformed LLM output, bounds, and the SDK-generated public schema.

Tooling notes: `genlayer-test` 0.30.1 attempts to unlink an open stdin fixture on Windows; use WSL. Its mock handler automatically decodes JSON once, so text-format LLM mocks are JSON-encoded strings. `genvm-linter` 0.11.0's full `check` loader targets an older runner layout and cannot load this pinned runner; CI uses its AST `lint` command and tests the actual SDK's schema generator separately. This does not claim the full linter check passed.

## Try the contract in Studio

Open [GenLayer Studio](https://studio.genlayer.com), select GenLayer Studio (chain 61999), and import `contracts/scopeseal.py`. Connect the requester wallet and use the built-in faucet if needed.

Deploy with a different provider address, a title, and the JSON-encoded `criteria` array from [examples/release_note.json](examples/release_note.json). Switch to the provider account for `accept_scope` and `submit_delivery`; pass the JSON-encoded `delivery` array. Switch to the requester for `seal_review`; pass the `review` array or `[]`. Either party can call `resolve`. Read `get_record` after consensus completes.

The sample is a small text-deliverable agreement. For your own run, replace the entire rubric and artifact before deployment. The 1–8 criteria and 8-item evidence bounds keep each consensus request bounded. Evidence is public: do not submit personal or confidential material.

## Live Studio run

Contract: [`0x1298f420156D97F6587e81D7E2379815Ce162B05`](https://explorer-studio.genlayer.com/address/0x1298f420156D97F6587e81D7E2379815Ce162B05), chain 61999.

Five transactions completed with `FINISHED_WITH_RETURN`, `MAJORITY_AGREE`, and finalized accepted status: deployment, provider acceptance, delivery, requester review seal, and resolution. The final record is `RESOLVED / SCOPE_MET`, with both criteria `MET` and exact excerpts from the delivered release note. This was a synthetic text-deliverable demonstration, with both role wallets controlled by the operator and funded by the Studio faucet. It does not establish performance on arbitrary agreements.

The resolution receipt records three `AGREE`, one `DISAGREE`, and one `IDLE` vote. The evidence establishes majority acceptance, not unanimity. The final-state read and all five receipt summaries are in [verification/studio-run.json](verification/studio-run.json).

To reproduce with fresh local role wallets, run these commands in order after installing dependencies:

```sh
python scripts/studio_demo.py init
python scripts/studio_demo.py deploy
python scripts/studio_demo.py accept
python scripts/studio_demo.py deliver
python scripts/studio_demo.py seal
python scripts/studio_demo.py resolve
python scripts/studio_demo.py status
python scripts/studio_demo.py read
```

The script refuses networks other than Studio chain 61999, uses the current fee-policy quote, and records transaction hashes before waiting. It refuses to submit a recorded step twice. `status` refreshes receipts; wait until all five are finalized before the final-state `read`. It keeps demonstration keys in ignored `.local-accounts.json` and progress in ignored `.local-run.json`; do not fund these keys with real assets. The checked-in evidence describes the original run and is not overwritten by reproduction.

## Limits and status

- Local SDK verification: 37 passing tests, AST lint, public-schema validation, and closure serialization checks. Live verification covers one small positive example; negative cases are verified locally with mocked LLM results, not claimed as live consensus runs.
- Evidence is supplied by the two parties. ScopeSeal does not authenticate documents, execute submitted code, fetch linked resources, or prove that real-world work happened. A URL string is not its content.
- The requester must seal a review before resolution. An uncooperative party can stall the workflow. There is no deadline, timeout, arbitration override, or payout mechanism.
- Prompt instructions are treated as untrusted evidence, but prompts are not a complete defense against model manipulation. Independent evaluation reduces single-answer trust; it does not establish immunity to correlated mistakes.
- Findings cannot be amended. A new agreement is needed for new evidence. Native transaction finality and appeals remain network concerns, not an application-level appeal feature.
- Different parties must have different addresses. That does not prove different human ownership.

Developed with AI assistance for the GenLayer builder contribution program. No reward or acceptance is implied.
