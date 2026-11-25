import { chromium, expect } from "@playwright/test";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mkdir, writeFile } from "node:fs/promises";
const rpc = createClient({ chain: studionet });
if (studionet.id !== 61999) throw Error("Studio only");
const actors = {
  requester: privateKeyToAccount(generatePrivateKey()),
  provider: privateKeyToAccount(generatePrivateKey()),
};
let role = "requester",
  chain = "0xf22f";
const proof = {
  chain_id: 61999,
  actors: Object.fromEntries(
    Object.entries(actors).map(([name, a]) => [name, a.address]),
  ),
  note: "Browser integration verification with two ephemeral wallets controlled by one operator. No real customer work.",
  transactions: [],
  checks: [],
};
for (const a of Object.values(actors))
  await rpc.request({ method: "sim_fundAccount", params: [a.address, 10e18] });
await mkdir("verification", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
await page.exposeFunction(
  "verificationWallet",
  async ({ method, params = [] }) => {
    const account = actors[role];
    if (method === "eth_chainId") return chain;
    if (method === "eth_accounts" || method === "eth_requestAccounts")
      return [account.address];
    if (method === "wallet_switchEthereumChain") {
      chain = params[0].chainId;
      return null;
    }
    if (method === "eth_sendTransaction") {
      if (chain !== "0xf22f") throw Error("Wrong network");
      const t = params[0];
      if (t.from.toLowerCase() !== account.address.toLowerCase())
        throw Error("Unexpected sender");
      const signed = await account.signTransaction({
        to: t.to,
        data: t.data,
        nonce: Number(t.nonce),
        gas: BigInt(t.gas),
        gasPrice: BigInt(t.gasPrice),
        value: BigInt(t.value || 0),
        chainId: 61999,
        type: "legacy",
      });
      const hash = await rpc.request({
        method: "eth_sendRawTransaction",
        params: [signed],
      });
      proof.transactions.push({ role, hash });
      console.log(JSON.stringify({ submitted: true, role, hash }));
      return hash;
    }
    throw Error(`Unexpected wallet request: ${method}`);
  },
);
await page.addInitScript(() => {
  const listeners = {};
  const provider = {
    request: (a) => window.verificationWallet(a),
    on: (event, fn) => {
      (listeners[event] ??= []).push(fn);
    },
    removeListener: (event, fn) => {
      listeners[event] = (listeners[event] || []).filter((x) => x !== fn);
    },
  };
  window.emitVerificationAccount = (account) =>
    (listeners.accountsChanged || []).forEach((fn) => fn([account]));
  window.addEventListener("eip6963:requestProvider", () =>
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: { uuid: "verification", name: "Local verification wallet" },
          provider,
        },
      }),
    ),
  );
});
async function action(name) {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Continue in wallet", exact: true })
    .click();
  await expect(
    page.getByText("Finalized and accepted", { exact: true }),
  ).toBeVisible({ timeout: 240000 });
  await page.getByRole("button", { name: "Dismiss receipt" }).click();
  console.log(JSON.stringify({ completed: name }));
}
try {
  await page.goto("http://127.0.0.1:5177/");
  await expect(page.getByText("Read from finalized chain state")).toBeVisible();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create an agreement", exact: true })
    .click();
  await page.getByRole("button", { name: "Use release-note example" }).click();
  await page
    .getByLabel("Provider wallet", { exact: true })
    .fill(actors.provider.address);
  await action("Review agreement & fee");
  await expect(
    page.getByText("The provider must accept the agreed scope.", {
      exact: true,
    }),
  ).toBeVisible();
  proof.contract = await page
    .getByLabel("Agreement address", { exact: true })
    .inputValue();
  role = "provider";
  await page.evaluate(
    (a) => window.emitVerificationAccount(a),
    actors.provider.address,
  );
  await action("Accept scope");
  await expect(page.getByLabel("Complete artifact text")).toBeVisible();
  await page.getByLabel("Label", { exact: true }).fill("Complete release note");
  await page
    .getByLabel("Complete artifact text")
    .fill(
      "ScopeSeal records agreed scope. Missing evidence remains unresolved; it never becomes automatic approval.",
    );
  await action("Submit delivery");
  role = "requester";
  await page.evaluate(
    (a) => window.emitVerificationAccount(a),
    actors.requester.address,
  );
  await page.getByLabel("Seal without additional evidence").check();
  await action("Seal review");
  await action("Request decision");
  await expect(page.getByText("Scope met", { exact: true })).toBeVisible();
  proof.record = JSON.parse(
    await rpc.readContract({
      address: proof.contract,
      functionName: "get_record",
      transactionHashVariant: "latest-final",
    }),
  );
  for (const t of proof.transactions) {
    const r = await rpc.getTransaction({ hash: t.hash });
    t.receipt = {
      lifecycle: r.lifecycle,
      execution: r.txExecutionResultName,
      result: r.result_name,
    };
  }
  proof.checks.push(
    "Real browser UI: deploy, accept, deliver, empty review seal, resolve, final read",
  );
  await page.screenshot({
    path: "verification/browser-desktop.png",
    fullPage: true,
  });
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw Error(`Horizontal overflow at ${width}`);
    proof.checks.push(`No overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "verification/browser-mobile.png",
    fullPage: true,
  });
  await writeFile(
    "verification/browser-live.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      verified: true,
      contract: proof.contract,
      phase: proof.record.phase,
      resolution: proof.record.resolution,
    }),
  );
} catch (e) {
  await page.screenshot({
    path: "verification/browser-failure.png",
    fullPage: true,
  });
  await writeFile(
    "verification/browser-partial.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.error(await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
}
