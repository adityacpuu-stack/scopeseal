export type Criterion = { id: string; requirement: string };
export type Evidence = { label: string; text: string };
export type Finding = {
  id: string;
  status: "MET" | "NOT_MET" | "INSUFFICIENT";
  citations: { source: "delivery" | "review"; item: number; quote: string }[];
};
export const phases = [
  "PROPOSED",
  "ACTIVE",
  "DELIVERED",
  "SEALED",
  "RESOLVED",
] as const;
export type RecordData = {
  title: string;
  requester: string;
  provider: string;
  phase: (typeof phases)[number] | "CANCELLED";
  resolution: string;
  criteria: Criterion[];
  delivery: Evidence[];
  review: Evidence[];
  findings: Finding[];
};
export const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
export const short = (s: string) =>
  s.length > 20 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
export const words = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (x) => x.toUpperCase());
export function validateCriteria(criteria: Criterion[]) {
  if (criteria.length < 1 || criteria.length > 8)
    throw Error("Add between 1 and 8 criteria.");
  const ids = new Set<string>();
  for (const row of criteria) {
    if (!/^[a-zA-Z0-9]{1,24}$/.test(row.id) || ids.has(row.id))
      throw Error(
        "Criterion IDs must be unique letters or numbers (1–24 characters).",
      );
    ids.add(row.id);
    if (
      row.requirement.trim().length < 10 ||
      row.requirement.trim().length > 600
    )
      throw Error("Each criterion needs 10–600 characters.");
  }
  if (JSON.stringify(criteria).length > 6000)
    throw Error("The scope is too long.");
}
export function validateEvidence(items: Evidence[], allowEmpty: boolean) {
  if (items.length > 8 || (!allowEmpty && !items.length))
    throw Error("Delivery needs 1–8 evidence items. Review allows 0–8.");
  for (const item of items) {
    if (!item.label.trim() || item.label.trim().length > 80)
      throw Error("Evidence labels need 1–80 characters.");
    if (item.text.trim().length < 8 || item.text.trim().length > 2000)
      throw Error("Evidence text needs 8–2,000 characters per item.");
  }
  if (JSON.stringify(items).length > 18000)
    throw Error("The evidence packet is too long.");
}
export function validateProposal(
  title: string,
  provider: string,
  requester: string,
  criteria: Criterion[],
) {
  if (!title.trim() || title.trim().length > 120)
    throw Error("Give the agreement a title (1–120 characters).");
  if (!isAddress(provider) || /^0x0{40}$/i.test(provider))
    throw Error("Enter a valid, nonzero provider wallet address.");
  if (provider.toLowerCase() === requester.toLowerCase())
    throw Error("Provider and requester must use different wallet addresses.");
  validateCriteria(criteria);
}
export function actionsFor(record: RecordData, account: string): string[] {
  const requester = record.requester.toLowerCase() === account.toLowerCase();
  const provider = record.provider.toLowerCase() === account.toLowerCase();
  if (record.phase === "PROPOSED")
    return [
      ...(provider ? ["accept_scope"] : []),
      ...(requester ? ["cancel_proposal"] : []),
    ];
  if (record.phase === "ACTIVE" && provider) return ["submit_delivery"];
  if (record.phase === "DELIVERED" && requester) return ["seal_review"];
  if (record.phase === "SEALED" && (requester || provider)) return ["resolve"];
  return [];
}
export function parseRecord(raw: unknown): RecordData {
  const r = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (
    !r ||
    typeof r !== "object" ||
    typeof r.title !== "string" ||
    !isAddress(r.requester) ||
    !isAddress(r.provider) ||
    ![...phases, "CANCELLED"].includes(r.phase)
  )
    throw Error("This address did not return a ScopeSeal record.");
  validateCriteria(r.criteria);
  validateEvidence(r.delivery, true);
  validateEvidence(r.review, true);
  if (
    !["UNRESOLVED", "SCOPE_MET", "GAPS_FOUND", "NEEDS_EVIDENCE"].includes(
      r.resolution,
    ) ||
    !Array.isArray(r.findings)
  )
    throw Error("Invalid decision record.");
  if (r.phase === "RESOLVED") {
    if (
      r.findings.length !== r.criteria.length ||
      new Set(r.findings.map((f: Finding) => f.id)).size !== r.criteria.length
    )
      throw Error("The resolved record is missing unique findings.");
    const statuses = r.findings.map((f: Finding) => f.status);
    const expected = statuses.includes("NOT_MET")
      ? "GAPS_FOUND"
      : statuses.includes("INSUFFICIENT")
        ? "NEEDS_EVIDENCE"
        : "SCOPE_MET";
    if (r.resolution !== expected)
      throw Error("The resolution does not match its findings.");
  } else if (r.resolution !== "UNRESOLVED" || r.findings.length)
    throw Error("The unfinished record contains a decision.");
  for (const f of r.findings) {
    if (
      !r.criteria.some((c: Criterion) => c.id === f.id) ||
      !["MET", "NOT_MET", "INSUFFICIENT"].includes(f.status) ||
      !Array.isArray(f.citations)
    )
      throw Error("Invalid findings.");
    if (f.status !== "INSUFFICIENT" && !f.citations.length)
      throw Error("A conclusive finding has no citation.");
    for (const c of f.citations)
      if (
        !["delivery", "review"].includes(c.source) ||
        !Number.isInteger(c.item) ||
        typeof c.quote !== "string" ||
        c.quote.trim().length < 8 ||
        !r[c.source][c.item]?.text.includes(c.quote)
      )
        throw Error("Invalid evidence citation.");
  }
  return r;
}
export type ReceiptLike = {
  lifecycle?: { state: string; outcome?: string; phase?: string };
  txExecutionResultName?: string;
};
export function receiptState(r: ReceiptLike) {
  if (r.lifecycle?.state === "canceled")
    return { done: true, success: false, label: "Canceled" };
  if (r.lifecycle?.state === "finalized") {
    const success =
      r.lifecycle.outcome === "accepted" &&
      r.txExecutionResultName === "FINISHED_WITH_RETURN";
    return {
      done: true,
      success,
      label: success
        ? "Finalized and accepted"
        : `Finalized: ${r.txExecutionResultName || r.lifecycle.outcome || "outcome unconfirmed"}`,
    };
  }
  return {
    done: false,
    success: false,
    label:
      r.lifecycle?.state === "decided"
        ? `Decision: ${r.lifecycle.outcome}. Waiting for finality.`
        : `Processing: ${r.lifecycle?.phase || "awaiting receipt"}`,
  };
}
