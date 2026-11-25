import { describe, it, expect } from "vitest";
import {
  actionsFor,
  parseRecord,
  receiptState,
  validateCriteria,
  validateEvidence,
  validateProposal,
  type RecordData,
} from "./model";
import archive from "./studio-run.json";
const record = archive.record as RecordData;
describe("party authority and finality", () => {
  it("only lets the provider accept or deliver", () => {
    expect(
      actionsFor({ ...record, phase: "PROPOSED" }, record.provider),
    ).toEqual(["accept_scope"]);
    expect(
      actionsFor({ ...record, phase: "ACTIVE" }, record.requester),
    ).toEqual([]);
  });
  it("only lets the requester seal or cancel", () => {
    expect(
      actionsFor({ ...record, phase: "DELIVERED" }, record.provider),
    ).toEqual([]);
    expect(
      actionsFor(
        { ...record, phase: "DELIVERED" },
        record.requester.toUpperCase(),
      ),
    ).toEqual(["seal_review"]);
    expect(
      actionsFor({ ...record, phase: "PROPOSED" }, record.requester),
    ).toEqual(["cancel_proposal"]);
  });
  it("allows either party to resolve, but never a spectator", () => {
    for (const account of [record.requester, record.provider])
      expect(actionsFor({ ...record, phase: "SEALED" }, account)).toEqual([
        "resolve",
      ]);
    expect(
      actionsFor({ ...record, phase: "SEALED" }, "0x" + "1".repeat(40)),
    ).toEqual([]);
  });
  it("locks resolved and canceled contracts", () => {
    expect(actionsFor(record, record.requester)).toEqual([]);
    expect(
      actionsFor({ ...record, phase: "CANCELLED" }, record.provider),
    ).toEqual([]);
  });
  it("does not confuse a decided receipt with finality", () => {
    expect(
      receiptState({
        lifecycle: { state: "decided", outcome: "accepted" },
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }).done,
    ).toBe(false);
  });
  it("requires accepted outcome and successful execution at finality", () => {
    expect(
      receiptState({
        lifecycle: { state: "finalized", outcome: "accepted" },
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }).success,
    ).toBe(true);
    expect(
      receiptState({
        lifecycle: { state: "finalized", outcome: "accepted" },
        txExecutionResultName: "USER_ERROR",
      }).success,
    ).toBe(false);
    expect(receiptState({ lifecycle: { state: "finalized" } }).success).toBe(
      false,
    );
    expect(receiptState({ lifecycle: { state: "canceled" } }).done).toBe(true);
  });
});
describe("evidence and proposal boundaries", () => {
  it("rejects identical parties and zero provider", () => {
    expect(() =>
      validateProposal(
        "Release",
        record.provider,
        record.provider,
        record.criteria,
      ),
    ).toThrow("different");
    expect(() =>
      validateProposal(
        "Release",
        "0x" + "0".repeat(40),
        record.requester,
        record.criteria,
      ),
    ).toThrow("nonzero");
  });
  it("rejects duplicate IDs and short criteria", () => {
    expect(() =>
      validateCriteria([record.criteria[0], record.criteria[0]]),
    ).toThrow("unique");
    expect(() => validateCriteria([{ id: "C1", requirement: "ok" }])).toThrow(
      "10–600",
    );
  });
  it("permits an empty sealed review but never an empty delivery", () => {
    expect(() => validateEvidence([], true)).not.toThrow();
    expect(() => validateEvidence([], false)).toThrow();
  });
  it("rejects oversized evidence before signing", () => {
    expect(() =>
      validateEvidence([{ label: "Work", text: "x".repeat(2001) }], false),
    ).toThrow();
  });
  it("reads genuine archived result, rejects wrong shape and fabricated quotations", () => {
    expect(parseRecord(JSON.stringify(record))).toEqual(record);
    expect(() => parseRecord("{}")).toThrow();
    const changed = structuredClone(record);
    changed.findings[0].citations[0].quote = "Not present in evidence";
    expect(() => parseRecord(changed)).toThrow("citation");
  });
  it("rejects a resolved record with missing findings or a contradictory outcome", () => {
    expect(() => parseRecord({ ...record, findings: [] })).toThrow("missing");
    expect(() => parseRecord({ ...record, resolution: "GAPS_FOUND" })).toThrow(
      "match",
    );
  });
});
