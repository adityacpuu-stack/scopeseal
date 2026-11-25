import { it, expect, vi } from "vitest";
import { checkWallet, switchStudio } from "./network";
it("refuses a wallet on any chain other than Studio", async () => {
  const request = vi.fn().mockResolvedValue("0x1");
  await expect(checkWallet({ request }, "0x123")).rejects.toThrow("Switch");
  expect(request).toHaveBeenCalledTimes(1);
});
it("refuses a changed signer even on the right network", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce("0xf22f")
    .mockResolvedValueOnce(["0x456"]);
  await expect(checkWallet({ request }, "0x123")).rejects.toThrow("changed");
});
it("does not trust a successful switch response without checking the actual chain", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce("0x1");
  await expect(switchStudio({ request })).rejects.toThrow("not switched");
});
it("does not add a chain after the user rejects a switch", async () => {
  const request = vi.fn().mockRejectedValue({ code: 4001 });
  await expect(switchStudio({ request })).rejects.toEqual({ code: 4001 });
  expect(request).toHaveBeenCalledTimes(1);
});
