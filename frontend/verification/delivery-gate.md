# ScopeSeal UI delivery gate

Verified 26 November 2026 (Asia/Jakarta). Evidence: `ui-checks.json`, `browser-live.json`, `browser-desktop.png`, `browser-mobile.png`, 16 passing unit tests and a successful TypeScript/Vite production build.

## Hard gate

- PASS R-02: application-authored prose contains no em dashes.
- PASS R-03: browser checks found no horizontal overflow at 360, 390, 768, 1024 and 1440 pixels, or with 200% root text size.
- PASS R-17/R-18: all criteria, addresses and findings come from on-chain reads or the explicitly selected archived receipt. No invented metrics or testimonials.
- PASS R-23/R-24: name is plain text; no invented logos or people. Navigation is confined to implemented controls and source/explorer resources.
- PASS R-25: automated axe scans of the populated reader and create form found zero contrast violations. Focus uses a dark amber outline; semantic statuses include text.
- PASS R-26: browser exercised live creation, acceptance, delivery, sealing, resolution, reading, example load, copy, download, fee confirmation, form item controls and cancellation of signing. Proposal cancellation uses the same verified submit pipeline with separately tested role/phase gating.
- PASS R-27: browser verified read errors, empty record and explicit archived fallback; pending and final receipts were exercised using real transactions.
- PASS R-28: no generic FAQ or unsupported claims.
- PASS R-32: native controls have labels and focus outlines; keyboard focus and Escape dismissal were verified.
- PASS R-33: implementation is in source files, not a source-rewriting patch script.
- PASS R-34: one intentional light theme; no nonfunctional theme toggle.
- PASS R-35: production build passed, automated control checks passed, live browser flow finalized all five transactions. Screenshots inspected at desktop and mobile dimensions.
- PASS R-36/R-38: synthetic demonstration and same-operator wallets are disclosed. No guarantees of security, rewards, adoption or model accuracy.
- PASS R-37: document-review direction and ENERGY 1 / RHYTHM 2 / MOTION 1 recorded in `DESIGN.md`.
- PASS R-39: native semantic controls, document language/title/landmarks, labels, visible state feedback and reduced-motion CSS; axe WCAG A/AA scans reported zero violations. This is not a claim of complete manual WCAG conformance.
- PASS R-40: no media layout shifts or autoplay. No measured-performance claims. The SDK bundle is approximately 221 KB gzipped; Vite reports its size warning.

## Purpose gate

- PASS R-01/R-07/R-10/R-12/R-13/R-19/R-22: no glows, gradients, background patterns, decorative animation, floating card shadows or stock illustrations.
- PASS R-04/R-08/R-09: no decorative icon system, arrow-filled buttons or promotional capsules. Findings have textual state markers.
- PASS R-06: serif titles establish the written-agreement identity, sans-serif controls remain familiar, monospace is restricted to identifiers. Reasons recorded in `DESIGN.md`.
- PASS R-14: composition follows criteria and evidence, with a narrower metadata ledger; it is not a marketing card grid.

## Liveliness

- PASS: the agreement title and decision are the focal point, criteria and citations establish the document motif, green marks primary actions and satisfied scope, and spacing separates scope/evidence/metadata. Desktop and mobile screenshots match the declared dials.

## Craft and consistency

- PASS C-1/C-3/R-05/R-20/R-30/R-31: document reading and party actions determine the layout. No generic landing-page sections or copied brand composition.
- PASS C-2/C-4: live writes, receipt recovery, wrong-chain refusal, changed-signer refusal, invalid input, wallet rejection and responsive layouts have recorded tests.
- PASS C-5/R-15/R-16: factual copy, specific action labels, no fabricated social proof or marketing superlatives.
- PASS R-11/R-21/R-29: restrained corner radii, intentionally light reading surface and limited graphite/gray-green/green palette.

## Verification limits

Live browser signing used an EIP-1193 provider backed by ephemeral Node-held wallets. Commercial wallet popup behavior was not automated. The live demonstration covers a positive release-note scope; contract negative cases are covered by the original contract tests. Access to the special builder working-group mission remains invite-only. This frontend is an improvement to ScopeSeal and does not establish a new reward entitlement.
