"""Two-role Studio demonstration. Keys stay in an ignored local file."""
import argparse
import hashlib
import json
from pathlib import Path

from eth_account import Account
from genlayer_py import create_client, studionet
from genlayer_py.types import CalldataAddress, TransactionHashVariant


ROOT = Path(__file__).resolve().parents[1]
KEYS = ROOT / ".local-accounts.json"
STATE = ROOT / ".local-run.json"


def save(state):
    STATE.parent.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2, default=str) + "\n", encoding="utf-8")


def summary(receipt):
    return {key: receipt.get(key) for key in ("hash", "from_address", "to_address", "lifecycle", "txExecutionResultName", "result_name", "last_round")}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("step", choices=["init", "deploy", "accept", "deliver", "seal", "resolve", "status", "read"])
    options = parser.parse_args()
    sample = json.loads((ROOT / "examples/release_note.json").read_text())
    if not KEYS.exists():
        if options.step != "init":
            raise SystemExit("Run init once before the demo.")
        KEYS.write_text(json.dumps({role: Account.create().key.hex() for role in ("requester", "provider")}), encoding="utf-8")
    accounts = {role: Account.from_key(key) for role, key in json.loads(KEYS.read_text()).items()}
    state = json.loads(STATE.read_text()) if STATE.exists() else {
        "chain_id": 61999,
        "rpc": "https://studio.genlayer.com/api",
        "actors": {role: account.address for role, account in accounts.items()},
        "transactions": {},
        "note": "Two demonstration roles controlled by the same operator; no real customer work or identity separation is claimed.",
    }
    if state["actors"] != {name: account.address for name, account in accounts.items()}:
        raise SystemExit("Local run belongs to different keys; use a fresh working copy.")
    for transaction in state["transactions"].values():
        if "receipt" in transaction:
            transaction["receipt"] = summary(transaction["receipt"])
    deployed = state["transactions"].get("deploy", {}).get("receipt", {})
    if deployed.get("txExecutionResultName") == "FINISHED_WITH_RETURN":
        state["contract"] = deployed["to_address"]
    role = "provider" if options.step in ("accept", "deliver") else "requester"
    client = create_client(chain=studionet, account=accounts[role])
    if client.chain_id != 61999:
        raise SystemExit("Refusing non-Studio network.")
    if options.step == "init":
        for name, account in accounts.items():
            if client.get_balance(account.address) < 10**18:
                client.fund_account(account.address, 10 * 10**18)
        save(state)
        print(json.dumps({"actors": state["actors"], "funded": True}))
        return
    if options.step == "status":
        for name, transaction in state["transactions"].items():
            receipt = client.get_transaction(transaction["hash"])
            transaction["receipt"] = summary(receipt)
            print(json.dumps({"step": name, "receipt": transaction["receipt"]}, default=str))
        save(state)
        return
    if options.step == "read":
        state["record"] = json.loads(client.read_contract(state["contract"], "get_record", transaction_hash_variant=TransactionHashVariant.LATEST_FINAL))
        state["record_variant"] = "latest-final"
        save(state)
        print(json.dumps(state["record"], indent=2))
        return
    if options.step in state["transactions"]:
        raise SystemExit("Step already submitted; use status, do not duplicate it.")
    fees = {"distribution": client.estimate_fees_distribution()}
    if options.step == "deploy":
        code = (ROOT / "contracts/scopeseal.py").read_bytes()
        state["code_sha256"] = hashlib.sha256(code).hexdigest()
        tx = client.deploy_contract(code, args=[CalldataAddress(accounts["provider"].address), sample["title"], json.dumps(sample["criteria"])], fees=fees)
    else:
        methods = {"accept": ("accept_scope", []), "deliver": ("submit_delivery", [json.dumps(sample["delivery"])]), "seal": ("seal_review", [json.dumps(sample["review"])]), "resolve": ("resolve", [])}
        name, args = methods[options.step]
        tx = client.write_contract(state["contract"], name, args=args, fees=fees)
    state["transactions"][options.step] = {"hash": tx}
    save(state)
    print(json.dumps({"submitted": options.step, "hash": tx}, default=str), flush=True)
    receipt = client.wait_for_transaction_receipt(tx, interval=3000, retries=20)
    state["transactions"][options.step]["receipt"] = summary(receipt)
    if options.step == "deploy" and receipt.get("txExecutionResultName") == "FINISHED_WITH_RETURN":
        state["contract"] = receipt["to_address"]
    save(state)
    print(json.dumps(summary(receipt), default=str), flush=True)
    if receipt.get("txExecutionResultName") != "FINISHED_WITH_RETURN":
        raise SystemExit("Execution failed; inspect the recorded receipt before continuing.")


if __name__ == "__main__":
    main()
