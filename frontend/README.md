# ScopeSeal web application

Public demo: https://scopeseal-review.adityapangestu.chatgpt.site

A working interface for [ScopeSeal](https://github.com/adityacpuu-stack/scopeseal), a GenLayer contract that reviews a written deliverable against immutable acceptance criteria. This is the frontend for the existing contract, not a separate contribution claim.

## Use

Open the demo to read the original finalized agreement without connecting a wallet. Each finding links to the supplied evidence. You can load another ScopeSeal address, export its record, or share its URL.

To create an agreement, connect an Ethereum-compatible browser wallet and switch to **GenLayer Studio, chain 61999**. Obtain GEN from Studio's faucet. Enter the other party's wallet, a title, and 1–8 acceptance criteria. The application quotes the execution deposit and asks for confirmation before opening the wallet. No private key is requested or stored by the application.

The provider accepts and submits 1–8 text artifacts. The requester seals a review, including an explicitly empty review if appropriate. Either party can request the decision after sealing. Controls follow the live phase and connected account. The pending transaction hash is saved in browser local storage so its receipt can be recovered on reload. Acceptance and finalization are displayed separately; the record uses `latest-final` only.

## Run locally

Requires Node.js 22 or later and npm.

```sh
npm ci
npm run dev
npm test
npm run build
```

`npm run build` performs TypeScript checking and generates `dist/`. Serve that folder using any static host with HTTPS. `/scopeseal.py` must remain accessible because new deployments use that exact contract source. The original contract source is unchanged.

## Verification

```sh
node scripts/check-live.mjs
# Start the development server on 127.0.0.1:5177 first:
npm run dev -- --port 5177
node scripts/check-ui.mjs
node scripts/live-browser.mjs
```

The browser scripts use a separately launched headless Chrome, never the user's browser profile. Chrome must be installed locally. `check-ui` uses a deliberately rejecting verification wallet to test connection, chain switching, signing cancellation, forms, archived fallback, downloads, responsive layout, accessibility and receipt recovery. It does not broadcast transactions.

`live-browser` creates two ephemeral wallets in the Node process, funds them using Studio's test faucet, and drives the actual browser UI through five real transactions. A local verification provider forwards signing to the Node process; keys are never passed to the page or written to disk. The two roles belong to the same operator. It writes only public addresses, hashes, receipts and screenshots into `verification/`. This tests the app's EIP-1193 interaction path, not any specific commercial wallet extension's popup.

See `verification/ui-checks.json` and `verification/browser-live.json` for observed results. The original example's receipts are copied from the contract repository into `src/studio-run.json`; this archived evidence is used only when the visitor explicitly selects it after a read failure.

## Boundaries

- Studio only. This interface refuses writes on other chains and rechecks the active signer before sending.
- Evidence is public and immutable. Do not submit confidential material.
- The contract does not authenticate documents, execute submitted code, fetch URLs, transfer funds, or hold escrow.
- Either party may stall the workflow; there is no timeout or automatic settlement.
- Model consensus can fail or make mistakes. The demonstration is synthetic, not evidence of performance on arbitrary work.
- Only the pending transaction identifier is saved locally. Clearing site data removes recovery information; public transaction history remains on the explorer.
- No analytics or backend database. Browser RPC calls go directly to GenLayer Studio; the font stylesheet comes from Google Fonts.

Developed with AI assistance. No reward, project acceptance or working-group access is promised.
