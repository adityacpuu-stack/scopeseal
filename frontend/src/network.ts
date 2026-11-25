import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionHashVariant } from "genlayer-js/types";
import { parseRecord, isAddress } from "./model";
export const CHAIN = 61999;
export const RPC = "https://studio.genlayer.com/api";
export const EXPLORER = "https://explorer-studio.genlayer.com";
export const DEMO = "0x1298f420156D97F6587e81D7E2379815Ce162B05";
export type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  on?: (event: string, fn: (value: any) => void) => void;
  removeListener?: (event: string, fn: (value: any) => void) => void;
};
export const reader = createClient({ chain: studionet, endpoint: RPC });
export async function readRecord(address: string) {
  if (!isAddress(address))
    throw Error(
      "Enter a contract address starting with 0x (40 hexadecimal characters).",
    );
  return parseRecord(
    await reader.readContract({
      address: address as `0x${string}`,
      functionName: "get_record",
      args: [],
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    }),
  );
}
export async function checkWallet(provider: Provider, account: string) {
  const chain = Number(await provider.request({ method: "eth_chainId" }));
  if (chain !== CHAIN)
    throw Error(
      "Switch your wallet to GenLayer Studio (61999). No transaction was sent.",
    );
  const accounts = await provider.request({ method: "eth_accounts" });
  if (!accounts[0] || accounts[0].toLowerCase() !== account.toLowerCase())
    throw Error(
      "The active wallet changed. Connect it again before continuing.",
    );
}
export function writer(provider: Provider, account: string) {
  return createClient({
    chain: studionet,
    endpoint: RPC,
    account: account as `0x${string}`,
    provider: provider as any,
  });
}
export async function switchStudio(provider: Provider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xf22f" }],
    });
  } catch (e: any) {
    if (e.code !== 4902) throw e;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0xf22f",
          chainName: "GenLayer Studio",
          rpcUrls: [RPC],
          nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
          blockExplorerUrls: [EXPLORER],
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xf22f" }],
    });
  }
  if (Number(await provider.request({ method: "eth_chainId" })) !== CHAIN)
    throw Error(
      "The wallet has not switched yet. Select GenLayer Studio in the wallet.",
    );
}
