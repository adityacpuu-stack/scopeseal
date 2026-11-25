import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalldataAddress, type Hash } from "genlayer-js/types";
import { formatEther, hexToBytes } from "viem";
import {
  actionsFor,
  phases,
  short,
  words,
  validateEvidence,
  validateProposal,
  receiptState,
  type RecordData,
  type Criterion,
  type Evidence,
} from "./model";
import {
  CHAIN,
  DEMO,
  EXPLORER,
  reader,
  readRecord,
  checkWallet,
  writer,
  switchStudio,
  type Provider,
} from "./network";
import archived from "./studio-run.json";
import example from "./example.json";
import "./style.css";

type Wallet = { name: string; id: string; provider: Provider };
type Pending = {
  hash: `0x${string}`;
  action: string;
  address: string;
  account: string;
};
const labels: Record<string, string> = {
  accept_scope: "Accept scope",
  cancel_proposal: "Cancel proposal",
  submit_delivery: "Submit delivery",
  seal_review: "Seal review",
  resolve: "Request decision",
  deploy: "Create agreement",
};
const next: Record<string, string> = {
  PROPOSED: "The provider must accept the agreed scope.",
  ACTIVE: "The provider can now submit the complete written deliverable.",
  DELIVERED:
    "The requester must seal a review before either party can ask for a decision.",
  SEALED: "Both packets are frozen. Either party can now request a decision.",
  RESOLVED:
    "This record is closed. A new scope or new evidence needs a new agreement.",
  CANCELLED: "The requester canceled this proposal before acceptance.",
};
function savedPending(): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem("scopeseal.pending") || "null");
    return p &&
      /^0x[0-9a-f]{64}$/i.test(p.hash) &&
      typeof p.action === "string" &&
      typeof p.address === "string"
      ? p
      : null;
  } catch {
    return null;
  }
}
function message(e: unknown) {
  return e && typeof e === "object" && "message" in e
    ? String(e.message)
    : String(e);
}
function App() {
  const initial = new URLSearchParams(location.search).get("contract") || DEMO;
  const [address, setAddress] = useState(initial),
    [inputAddress, setInputAddress] = useState(initial),
    [record, setRecord] = useState<RecordData | null>(null);
  const [source, setSource] = useState<"live" | "archive">("live"),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"review" | "create">("review"),
    [wallets, setWallets] = useState<Wallet[]>([]),
    [walletId, setWalletId] = useState(""),
    [wallet, setWallet] = useState<Wallet | null>(null),
    [account, setAccount] = useState(""),
    [chain, setChain] = useState<number | null>(null);
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Pending | null>(savedPending),
    [txLabel, setTxLabel] = useState(""),
    [receipt, setReceipt] = useState<any>(null),
    [txDone, setTxDone] = useState(false);
  const [title, setTitle] = useState(""),
    [provider, setProvider] = useState(""),
    [criteria, setCriteria] = useState<Criterion[]>([
      { id: "C1", requirement: "" },
    ]),
    [evidence, setEvidence] = useState<Evidence[]>([{ label: "", text: "" }]),
    [emptyReview, setEmptyReview] = useState(false);
  const [proposal, setProposal] = useState<{
    action: string;
    args: unknown[];
    description: string;
    fee: string;
    fees: any;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    readSequence = useRef(0),
    sending = useRef(false);
  async function load(addr: string) {
    const seq = ++readSequence.current;
    setLoading(true);
    setError("");
    setRecord(null);
    setSource("live");
    try {
      const value = await readRecord(addr);
      if (seq !== readSequence.current) return;
      setRecord(value);
      setAddress(addr);
      setInputAddress(addr);
      const url = new URL(location.href);
      url.searchParams.set("contract", addr);
      history.replaceState(null, "", url);
    } catch (e) {
      if (seq === readSequence.current)
        setError(`Could not read the finalized record. ${message(e)}`);
    } finally {
      if (seq === readSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load(initial);
    const found = new Map<string, Wallet>();
    const announce = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d?.provider || !d.info?.uuid) return;
      found.set(d.info.uuid, {
        id: d.info.uuid,
        name: d.info.name,
        provider: d.provider,
      });
      setWallets([...found.values()]);
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const fallback = setTimeout(() => {
      if (!found.size && (window as any).ethereum) {
        const w = {
          id: "injected",
          name: "Browser wallet",
          provider: (window as any).ethereum,
        };
        setWallets([w]);
      }
    }, 300);
    return () => {
      clearTimeout(fallback);
      window.removeEventListener("eip6963:announceProvider", announce);
    };
  }, []);
  useEffect(() => {
    if (!wallet) return;
    const accountsChanged = (accounts: string[]) => {
      setAccount(accounts[0] || "");
      setProposal(null);
      dialog.current?.close();
    };
    const chainChanged = (id: string) => {
      setChain(Number(id));
      setProposal(null);
      dialog.current?.close();
    };
    wallet.provider.on?.("accountsChanged", accountsChanged);
    wallet.provider.on?.("chainChanged", chainChanged);
    return () => {
      wallet.provider.removeListener?.("accountsChanged", accountsChanged);
      wallet.provider.removeListener?.("chainChanged", chainChanged);
    };
  }, [wallet]);
  useEffect(() => {
    if (proposal) dialog.current?.showModal();
  }, [proposal]);
  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setTxDone(false);
    setReceipt(null);
    setTxLabel("Transaction submitted. Waiting for consensus.");
    async function poll() {
      try {
        const r = await reader.getTransaction({ hash: pending!.hash as Hash });
        if (stopped) return;
        const state = receiptState(r);
        setReceipt(r);
        setTxLabel(state.label);
        if (state.done) {
          setTxDone(true);
          if (state.success) {
            const addr =
              pending!.action === "deploy" ? r.to_address : pending!.address;
            if (addr) {
              setMode("review");
              await load(addr);
            }
          }
          return;
        }
      } catch (e) {
        if (!stopped)
          setTxLabel(
            `Receipt unavailable. Retrying automatically. ${message(e).slice(0, 160)}`,
          );
      }
      if (!stopped) timer = setTimeout(poll, 7000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending?.hash]);
  async function connect() {
    setError("");
    setBusy(true);
    try {
      const w = wallets.find((w) => w.id === walletId) || wallets[0];
      if (!w)
        throw Error(
          "Open this app in a browser with an Ethereum-compatible wallet extension. Reading records needs no wallet.",
        );
      const accounts = await w.provider.request({
        method: "eth_requestAccounts",
      });
      if (!accounts[0]) throw Error("No account was connected.");
      setWallet(w);
      setAccount(accounts[0]);
      setChain(Number(await w.provider.request({ method: "eth_chainId" })));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function switchNetwork() {
    if (!wallet) return;
    setBusy(true);
    setError("");
    try {
      await switchStudio(wallet.provider);
      setChain(CHAIN);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function prepare(action: string) {
    if (!wallet || !account) {
      setError("Connect the wallet for the required party first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await checkWallet(wallet.provider, account);
      let args: unknown[] = [];
      let description = "";
      if (action === "deploy") {
        validateProposal(title, provider, account, criteria);
        args = [
          new CalldataAddress(hexToBytes(provider as `0x${string}`)),
          title,
          JSON.stringify(criteria),
        ];
        description =
          "Your title, provider address and criteria will become public and cannot be edited.";
      } else {
        if (!record || source !== "live")
          throw Error("Load a live agreement first.");
        const latest = await readRecord(address);
        if (!actionsFor(latest, account).includes(action))
          throw Error(
            "This action is no longer available for this wallet. Refresh the agreement.",
          );
        if (action === "submit_delivery" || action === "seal_review") {
          const items = action === "seal_review" && emptyReview ? [] : evidence;
          validateEvidence(items, action === "seal_review");
          args = [JSON.stringify(items)];
          description =
            "This evidence becomes public and cannot be replaced. Do not include private or confidential material.";
        } else
          description =
            action === "resolve"
              ? "Validators will judge both frozen evidence packets against the agreed criteria. The findings cannot be amended."
              : action === "cancel_proposal"
                ? "This permanently cancels the unaccepted proposal."
                : "This accepts the scope as written. The requester can no longer cancel it.";
      }
      const fees = await reader.estimateTransactionFees();
      setProposal({
        action,
        args,
        description,
        fee: formatEther(fees.feeValue),
        fees: { distribution: fees.distribution, feeValue: fees.feeValue },
      });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!proposal || !wallet || sending.current || (pending && !txDone)) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const p = proposal;
    setProposal(null);
    dialog.current?.close();
    try {
      await checkWallet(wallet.provider, account);
      const client = writer(wallet.provider, account);
      let hash: `0x${string}`;
      if (p.action === "deploy") {
        const response = await fetch("/scopeseal.py");
        if (!response.ok) throw Error("Contract source could not be loaded.");
        hash = await client.deployContract({
          code: await response.text(),
          args: p.args as any,
          fees: p.fees,
        });
      } else
        hash = await client.writeContract({
          address: address as `0x${string}`,
          functionName: p.action,
          args: p.args as any,
          fees: p.fees,
        });
      const tx = {
        hash,
        action: p.action,
        address: p.action === "deploy" ? "" : address,
        account,
      };
      try {
        localStorage.setItem("scopeseal.pending", JSON.stringify(tx));
      } catch {
        setNotice(
          "Keep this tab open: your browser could not save the transaction for recovery.",
        );
      }
      setPending(tx);
      setEvidence([{ label: "", text: "" }]);
      setEmptyReview(false);
    } catch (e) {
      setError(`Transaction was not confirmed by the app. ${message(e)}`);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const locked = busy || (!!pending && !txDone);
  const available =
    record && source === "live" && account && chain === CHAIN
      ? actionsFor(record, account)
      : [];
  const needsEvidence =
    available.includes("submit_delivery") || available.includes("seal_review");
  function download() {
    if (!record) return;
    const blob = new Blob(
      [
        JSON.stringify(
          { chain_id: CHAIN, contract: address, source, record },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scopeseal-record.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <a href="#workspace" className="skip">
        Skip to agreement
      </a>
      <header>
        <a className="wordmark" href="/">
          ScopeSeal<span>Work, held to its word.</span>
        </a>
        <div className="wallet">
          <span className="network">GenLayer Studio · 61999</span>
          {!account && wallets.length > 1 && (
            <label className="wallet-choice">
              Wallet
              <select
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button onClick={connect} disabled={busy}>
            {account ? short(account) : "Connect wallet"}
          </button>
        </div>
      </header>
      <main id="workspace">
        <section className="intro">
          <div>
            <p className="kicker">The agreement is the reference.</p>
            <h1>
              What was promised.
              <br />
              What was delivered.
            </h1>
            <p className="lede">
              Review written work against an agreed scope. Keep the criteria,
              evidence and decision in one shared record.
            </p>
          </div>
          <div className="intro-action">
            <button
              className="primary"
              onClick={() => {
                setMode(mode === "create" ? "review" : "create");
                setError("");
              }}
              disabled={locked}
            >
              {mode === "create" ? "Back to agreement" : "Create an agreement"}
            </button>
            <p>
              Public evidence. Two wallets.
              <br />
              No escrow or automatic payouts.
            </p>
          </div>
        </section>
        <div aria-live="polite">
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {notice && <div className="alert">{notice}</div>}
          {account && chain !== CHAIN && (
            <div className="alert">
              Your wallet is on chain {chain ?? "unknown"}. Writes require
              GenLayer Studio.
              <button onClick={switchNetwork} disabled={busy}>
                Switch to Studio
              </button>
            </div>
          )}
        </div>
        {pending && (
          <section className="transaction" aria-live="polite">
            <div>
              <strong>{labels[pending.action] || pending.action}</strong>
              <p>{txLabel}</p>
              <a
                href={`${EXPLORER}/transactions/${pending.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                Transaction {short(pending.hash)}
              </a>
              {receipt?.last_round?.validator_votes_name && (
                <p className="small">
                  Votes: {receipt.last_round.validator_votes_name.join(", ")}
                </p>
              )}
            </div>
            {txDone && (
              <button
                onClick={() => {
                  setPending(null);
                  try {
                    localStorage.removeItem("scopeseal.pending");
                  } catch {}
                }}
              >
                Dismiss receipt
              </button>
            )}
          </section>
        )}
        {mode === "create" ? (
          <section className="create-layout">
            <div className="paper">
              <h2>Write the agreement</h2>
              <p>
                The connected wallet becomes the requester. Use a different
                wallet for the provider.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void prepare("deploy");
                }}
              >
                <label>
                  Agreement title
                  <input
                    value={title}
                    maxLength={120}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="A clear name for the deliverable"
                  />
                </label>
                <label>
                  Provider wallet
                  <input
                    value={provider}
                    onChange={(e) => setProvider(e.target.value.trim())}
                    required
                    placeholder="0x…"
                    spellCheck={false}
                  />
                </label>
                <div className="section-head">
                  <h3>Acceptance criteria</h3>
                  <span>{criteria.length} of 8</span>
                </div>
                <p className="small">
                  Every criterion is mandatory. Describe what the supplied text
                  must demonstrate.
                </p>
                {criteria.map((c, i) => (
                  <fieldset key={i}>
                    <legend>Criterion {i + 1}</legend>
                    <label>
                      ID
                      <input
                        value={c.id}
                        maxLength={24}
                        onChange={(e) =>
                          setCriteria(
                            criteria.map((x, n) =>
                              n === i ? { ...x, id: e.target.value } : x,
                            ),
                          )
                        }
                        required
                      />
                    </label>
                    <label>
                      Requirement
                      <textarea
                        value={c.requirement}
                        minLength={10}
                        maxLength={600}
                        onChange={(e) =>
                          setCriteria(
                            criteria.map((x, n) =>
                              n === i
                                ? { ...x, requirement: e.target.value }
                                : x,
                            ),
                          )
                        }
                        required
                        rows={3}
                      />
                    </label>
                    {criteria.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCriteria(criteria.filter((_, n) => n !== i))
                        }
                      >
                        Remove criterion {i + 1}
                      </button>
                    )}
                  </fieldset>
                ))}
                <div className="actions">
                  <button
                    type="button"
                    disabled={criteria.length >= 8}
                    onClick={() =>
                      setCriteria([
                        ...criteria,
                        {
                          id: `C${Math.max(0, ...criteria.map((x) => Number(x.id.slice(1)) || 0)) + 1}`,
                          requirement: "",
                        },
                      ])
                    }
                  >
                    Add criterion
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTitle(example.title);
                      setCriteria(example.criteria);
                    }}
                  >
                    Use release-note example
                  </button>
                </div>
                <button
                  className="primary wide"
                  disabled={locked || !account || chain !== CHAIN}
                >
                  Review agreement & fee
                </button>
                {!account && <p>Connect your requester wallet to continue.</p>}
              </form>
            </div>
            <aside className="ledger">
              <h2>Before you agree</h2>
              <p>
                Criteria are fixed at creation. Neither party can edit them
                later.
              </p>
              <p>
                The provider accepts, then submits a written artifact. The
                requester seals a review. Either party may then request a
                decision.
              </p>
              <p>
                A party can stall this process. There are no deadlines or
                automatic refunds.
              </p>
              <a
                href="https://studio.genlayer.com"
                target="_blank"
                rel="noreferrer"
              >
                Open Studio for faucet GEN
              </a>
              <p className="small">
                Use Studio funds only. This app never asks for a private key.
              </p>
            </aside>
          </section>
        ) : (
          <>
            <form
              className="address-bar"
              onSubmit={(e) => {
                e.preventDefault();
                void load(inputAddress);
              }}
            >
              <label>
                Agreement address
                <input
                  value={inputAddress}
                  onChange={(e) => setInputAddress(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <button className="primary" disabled={loading || locked}>
                {loading ? "Reading…" : "Open agreement"}
              </button>
              <button
                type="button"
                disabled={loading || locked}
                onClick={() => void load(DEMO)}
              >
                Open live example
              </button>
            </form>
            {loading && (
              <div className="empty" role="status">
                <h2>Reading the finalized record…</h2>
                <p>Fetching the agreement directly from GenLayer Studio.</p>
              </div>
            )}
            {!loading && !record && (
              <div className="empty">
                <h2>No record to show</h2>
                <p>
                  Check the address and retry. You can also inspect the saved
                  receipt from our documented demonstration.
                </p>
                <button
                  onClick={() => {
                    ++readSequence.current;
                    setRecord(archived.record as RecordData);
                    setAddress(DEMO);
                    setInputAddress(DEMO);
                    setSource("archive");
                    setError("");
                  }}
                >
                  View archived example
                </button>
              </div>
            )}
            {record && !loading && (
              <>
                <section className="record-heading">
                  <div>
                    <p className="kicker">
                      {source === "live"
                        ? "Read from finalized chain state"
                        : "Archived example · not a live read"}
                    </p>
                    <h2>{record.title}</h2>
                    <p>{next[record.phase]}</p>
                  </div>
                  <div
                    className={`verdict ${record.resolution === "SCOPE_MET" ? "met" : ""}`}
                  >
                    <span>
                      {record.phase === "RESOLVED"
                        ? "Decision"
                        : "Agreement status"}
                    </span>
                    <strong>
                      {words(
                        record.phase === "RESOLVED"
                          ? record.resolution
                          : record.phase,
                      )}
                    </strong>
                  </div>
                </section>
                <ol className="progress" aria-label="Agreement progress">
                  {phases.map((p, i) => (
                    <li
                      key={p}
                      className={
                        record.phase === p
                          ? "current"
                          : phases.indexOf(record.phase as any) > i
                            ? "complete"
                            : ""
                      }
                      aria-current={record.phase === p ? "step" : undefined}
                    >
                      {words(p)}
                    </li>
                  ))}
                </ol>
                <div className="review-layout">
                  <div className="paper">
                    <div className="section-head">
                      <h2>Scope & findings</h2>
                      <span>{record.criteria.length} criteria</span>
                    </div>
                    {record.criteria.map((c) => {
                      const f = record.findings.find((f) => f.id === c.id);
                      return (
                        <article className="criterion" key={c.id}>
                          <div className="criterion-title">
                            <span className="criterion-id">{c.id}</span>
                            <h3>{c.requirement}</h3>
                            <span
                              className={`finding ${f?.status === "MET" ? "met" : ""}`}
                            >
                              {f ? words(f.status) : "Not judged"}
                            </span>
                          </div>
                          {f?.citations.map((ref, i) => (
                            <blockquote key={i}>
                              <p>“{ref.quote}”</p>
                              <a href={`#${ref.source}-${ref.item}`}>
                                {words(ref.source)} ·{" "}
                                {record[ref.source][ref.item].label}
                              </a>
                            </blockquote>
                          ))}
                          {f?.status === "INSUFFICIENT" &&
                            !f.citations.length && (
                              <p className="small">
                                No conclusive supporting quotation was recorded.
                              </p>
                            )}
                        </article>
                      );
                    })}
                    <div className="evidence-columns">
                      {(["delivery", "review"] as const).map((group) => (
                        <section key={group}>
                          <h2>
                            {group === "delivery"
                              ? "Delivery evidence"
                              : "Requester review"}
                          </h2>
                          {!record[group].length ? (
                            <p className="muted">
                              {group === "review" &&
                              ["SEALED", "RESOLVED"].includes(record.phase)
                                ? "The requester sealed an empty review."
                                : "No evidence submitted."}
                            </p>
                          ) : (
                            record[group].map((item, i) => (
                              <article
                                className="evidence"
                                id={`${group}-${i}`}
                                key={i}
                              >
                                <h3>{item.label}</h3>
                                <p>{item.text}</p>
                              </article>
                            ))
                          )}
                        </section>
                      ))}
                    </div>
                    {available.length > 0 && (
                      <section className="next-action">
                        <h2>Your next action</h2>
                        {needsEvidence && (
                          <>
                            {available.includes("seal_review") && (
                              <label className="check">
                                <input
                                  type="checkbox"
                                  checked={emptyReview}
                                  onChange={(e) =>
                                    setEmptyReview(e.target.checked)
                                  }
                                />
                                Seal without additional evidence
                              </label>
                            )}
                            {!emptyReview &&
                              evidence.map((item, i) => (
                                <fieldset key={i}>
                                  <legend>Evidence {i + 1}</legend>
                                  <label>
                                    Label
                                    <input
                                      value={item.label}
                                      maxLength={80}
                                      onChange={(e) =>
                                        setEvidence(
                                          evidence.map((x, n) =>
                                            n === i
                                              ? { ...x, label: e.target.value }
                                              : x,
                                          ),
                                        )
                                      }
                                    />
                                  </label>
                                  <label>
                                    Complete artifact text
                                    <textarea
                                      rows={5}
                                      maxLength={2000}
                                      value={item.text}
                                      onChange={(e) =>
                                        setEvidence(
                                          evidence.map((x, n) =>
                                            n === i
                                              ? { ...x, text: e.target.value }
                                              : x,
                                          ),
                                        )
                                      }
                                    />
                                  </label>
                                  {evidence.length > 1 && (
                                    <button
                                      onClick={() =>
                                        setEvidence(
                                          evidence.filter((_, n) => n !== i),
                                        )
                                      }
                                    >
                                      Remove evidence {i + 1}
                                    </button>
                                  )}
                                </fieldset>
                              ))}
                            {!emptyReview && (
                              <button
                                disabled={evidence.length >= 8}
                                onClick={() =>
                                  setEvidence([
                                    ...evidence,
                                    { label: "", text: "" },
                                  ])
                                }
                              >
                                Add evidence item
                              </button>
                            )}
                          </>
                        )}
                        <div className="actions">
                          {available.map((a) => (
                            <button
                              key={a}
                              className={
                                a === "cancel_proposal" ? "" : "primary"
                              }
                              disabled={locked}
                              onClick={() => void prepare(a)}
                            >
                              {labels[a]}
                            </button>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                  <aside className="ledger">
                    <h2>Record details</h2>
                    <dl>
                      <dt>Requester</dt>
                      <dd>
                        <a
                          href={`${EXPLORER}/address/${record.requester}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {record.requester}
                        </a>
                      </dd>
                      <dt>Provider</dt>
                      <dd>
                        <a
                          href={`${EXPLORER}/address/${record.provider}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {record.provider}
                        </a>
                      </dd>
                      <dt>Contract</dt>
                      <dd>
                        <a
                          href={`${EXPLORER}/address/${address}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {address}
                        </a>
                      </dd>
                      <dt>Network</dt>
                      <dd>GenLayer Studio · 61999</dd>
                      <dt>Connected as</dt>
                      <dd>
                        {!account
                          ? "Reader"
                          : account.toLowerCase() ===
                              record.requester.toLowerCase()
                            ? "Requester"
                            : account.toLowerCase() ===
                                record.provider.toLowerCase()
                              ? "Provider"
                              : "Reader (not a party)"}
                      </dd>
                    </dl>
                    <button
                      className="wide"
                      onClick={() => void load(address)}
                      disabled={locked}
                    >
                      Refresh chain state
                    </button>
                    <button className="wide" onClick={download}>
                      Download record
                    </button>
                    <button
                      className="wide"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            `${location.origin}${location.pathname}?contract=${address}`,
                          );
                          setNotice("Agreement link copied.");
                        } catch {
                          setNotice(
                            "Copy this page’s address from your browser to share the agreement.",
                          );
                        }
                      }}
                    >
                      Copy agreement link
                    </button>
                    {address.toLowerCase() === DEMO.toLowerCase() && (
                      <div className="demo-note">
                        <h3>About this example</h3>
                        <p>
                          A synthetic release-note agreement. Both role wallets
                          belong to the same operator.
                        </p>
                        <a
                          href="https://github.com/adityacpuu-stack/scopeseal/blob/main/verification/studio-run.json"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Read all five transaction receipts
                        </a>
                      </div>
                    )}
                  </aside>
                </div>
              </>
            )}
          </>
        )}
        <section className="limits">
          <h2>Know what the decision means.</h2>
          <p>
            ScopeSeal judges the text supplied by the two parties. It does not
            authenticate documents, execute delivered code or open links.
            Missing proof stays unresolved. Validators can disagree, and
            consensus can fail.
          </p>
        </section>
      </main>
      <footer>
        <span>ScopeSeal · Built on GenLayer</span>
        <a
          href="https://github.com/adityacpuu-stack/scopeseal"
          target="_blank"
          rel="noreferrer"
        >
          Contract source & verification
        </a>
        <a href="/scopeseal.py" download>
          Download contract
        </a>
      </footer>
      <dialog
        ref={dialog}
        onCancel={() => setProposal(null)}
        onClose={() => setProposal(null)}
      >
        {proposal && (
          <>
            <h2>{labels[proposal.action]}</h2>
            <p>{proposal.description}</p>
            <dl>
              <dt>Network</dt>
              <dd>GenLayer Studio (61999)</dd>
              <dt>Signing wallet</dt>
              <dd className="address">{account}</dd>
              <dt>Quoted execution deposit</dt>
              <dd>{proposal.fee} GEN, plus network gas</dd>
            </dl>
            <p>
              Your wallet shows the final transaction details before you
              approve.
            </p>
            <div className="actions">
              <button
                onClick={() => {
                  dialog.current?.close();
                  setProposal(null);
                }}
              >
                Back to editing
              </button>
              <button className="primary" disabled={locked} onClick={send}>
                Continue in wallet
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
