import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const checks = [];
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const wallet = "0x1111111111111111111111111111111111111111";
await page.addInitScript((account) => {
  let chain = "0x1";
  const provider = {
    request: async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts")
        return [account];
      if (method === "eth_chainId") return chain;
      if (method === "wallet_switchEthereumChain") {
        chain = params[0].chainId;
        return null;
      }
      const err = new Error("Wallet rejected this verification transaction");
      err.code = 4001;
      throw err;
    },
    on: () => {},
    removeListener: () => {},
  };
  window.addEventListener("eip6963:requestProvider", () =>
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: { info: { uuid: "qa", name: "Verification wallet" }, provider },
      }),
    ),
  );
}, wallet);
try {
  await page.goto("http://127.0.0.1:5177/");
  await expect(page.getByText("Read from finalized chain state")).toBeVisible();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(page.getByText(/Your wallet is on chain 1/)).toBeVisible();
  await page
    .getByRole("button", { name: "Switch to Studio", exact: true })
    .click();
  await expect(page.getByText(/Your wallet is on chain 1/)).toHaveCount(0);
  checks.push("Connect and explicit Studio switch");
  await page
    .getByRole("link", { name: "Delivery · Complete release note" })
    .first()
    .click();
  await expect(page.locator("#delivery-0")).toBeInViewport();
  await page.getByRole("button", { name: "Copy agreement link" }).click();
  await expect(page.getByText("Agreement link copied.")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download record" }).click(),
  ]);
  await download.saveAs("artifacts/download-record.json");
  if (
    JSON.parse(await readFile("artifacts/download-record.json", "utf8")).record
      .resolution !== "SCOPE_MET"
  )
    throw Error("Incorrect download");
  await page.getByRole("button", { name: "Refresh chain state" }).click();
  await expect(page.getByText("Read from finalized chain state")).toBeVisible();
  checks.push("Evidence anchor, copy link, record download and live refresh");
  await page
    .getByLabel("Agreement address", { exact: true })
    .fill("bad-address");
  await page
    .getByRole("button", { name: "Open agreement", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Could not read");
  await page.getByRole("button", { name: "View archived example" }).click();
  await expect(
    page.getByText("Archived example · not a live read"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open live example" }).click();
  await expect(page.getByText("Read from finalized chain state")).toBeVisible();
  checks.push(
    "Invalid address, explicit archived fallback, return to live state",
  );
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error(`Overflow at ${width}`);
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Overflow at 200%");
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  checks.push("Responsive review at 360/390/768/1024/1440px and 200% text");
  const reviewAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  if (reviewAxe.violations.length)
    throw Error(
      JSON.stringify(
        reviewAxe.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ),
    );
  checks.push("Review axe WCAG automated scan: zero violations");
  await page
    .getByRole("button", { name: "Create an agreement", exact: true })
    .click();
  await page.getByRole("button", { name: "Use release-note example" }).click();
  await page
    .getByRole("button", { name: "Add criterion", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove criterion 3", exact: true })
    .click();
  await page
    .getByLabel("Provider wallet", { exact: true })
    .fill("0x2222222222222222222222222222222222222222");
  const createAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  if (createAxe.violations.length)
    throw Error(JSON.stringify(createAxe.violations.map((v) => v.id)));
  checks.push(
    "Create form, example fill, add/remove criterion; axe scan: zero violations",
  );
  await page.getByRole("button", { name: "Review agreement & fee" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Review agreement & fee" }).click();
  await page.getByRole("button", { name: "Back to editing" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Review agreement & fee" }).click();
  await page.getByRole("button", { name: "Continue in wallet" }).click();
  await expect(page.getByRole("alert")).toContainText("Wallet rejected");
  checks.push(
    "Fee review; Escape, back, wallet rejection without a transaction",
  );
  await page
    .getByRole("button", { name: "Back to agreement", exact: true })
    .click();
  const archive = JSON.parse(await readFile("src/studio-run.json", "utf8"));
  await page.evaluate(
    (p) => localStorage.setItem("scopeseal.pending", JSON.stringify(p)),
    {
      hash: archive.transactions.resolve.hash,
      action: "resolve",
      address: archive.contract,
      account: wallet,
    },
  );
  await page.reload();
  await expect(
    page.getByText("Finalized and accepted", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss receipt" }).click();
  if (await page.evaluate(() => localStorage.getItem("scopeseal.pending")))
    throw Error("Receipt not cleared");
  checks.push(
    "Restore real transaction on reload; finalize and dismiss receipt",
  );
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => ({
    tag: document.activeElement.tagName,
    outline: getComputedStyle(document.activeElement).outlineStyle,
  }));
  if (focus.outline === "none") throw Error("No keyboard focus indicator");
  checks.push("Visible keyboard focus; native dialog Escape");
  if (errors.length) throw Error(JSON.stringify(errors));
  await mkdir("verification", { recursive: true });
  await writeFile(
    "verification/ui-checks.json",
    JSON.stringify({ checks, consoleErrors: errors }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await browser.close();
}
