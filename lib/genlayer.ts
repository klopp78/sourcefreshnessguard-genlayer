import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

export const SOURCE_FRESHNESS_GUARD_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_SOURCE_FRESHNESS_GUARD_CONTRACT_ADDRESS ??
    "0x29bA75C8bE8A62C2A2f93b7ed7C8BE61e4a774C2") as `0x${string}`;

export type WalletAddress = `0x${string}`;

export type ChainReadOptions = {
  walletAddress?: WalletAddress;
  contractAddress?: `0x${string}`;
};

export type SourceBundleInput = {
  walletAddress: WalletAddress;
  subject: string;
  expectedUpdateCadence: string;
  primarySourceUrl: string;
  secondarySourceUrl: string;
  referenceSourceUrl: string;
  maxStalenessHours: string;
  contractAddress?: `0x${string}`;
};

export type FreshnessInput = {
  walletAddress: WalletAddress;
  bundleId: string;
  observationLabel: string;
  observedAt: string;
  observationUrl: string;
  contractAddress?: `0x${string}`;
};

export function createFreshnessClient(walletAddress?: WalletAddress) {
  return createClient({
    chain: studionet,
    account: walletAddress,
  });
}

function createFreshnessWriteClient(walletAddress: WalletAddress) {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!provider) throw new Error("No browser wallet detected.");

  return createClient({
    chain: studionet,
    account: walletAddress,
    provider,
  });
}

async function connectStudionet(client: ReturnType<typeof createFreshnessWriteClient>) {
  const provider = window.ethereum;
  if (!provider) throw new Error("No browser wallet detected.");

  const chainId = `0x${studionet.id.toString(16)}`;
  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (typeof currentChainId === "string" && currentChainId.toLowerCase() === chainId) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: studionet.name,
        rpcUrls: [...studionet.rpcUrls.default.http],
        nativeCurrency: studionet.nativeCurrency,
        blockExplorerUrls: [studionet.blockExplorers.default.url],
      }],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }

  client.chain = studionet;
}

function isUnknownChainError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; data?: { originalError?: { code?: unknown } } };
  return record.code === 4902 ||
    record.data?.originalError?.code === 4902 ||
    (typeof record.message === "string" && /unknown|unrecognized|not added/i.test(record.message));
}

function contractAddress(contractAddress?: `0x${string}`) {
  return contractAddress ?? SOURCE_FRESHNESS_GUARD_CONTRACT_ADDRESS;
}

export async function readSourceBundle(bundleId: string, options: ChainReadOptions = {}) {
  const client = createFreshnessClient(options.walletAddress);
  return client.readContract({
    address: contractAddress(options.contractAddress),
    functionName: "get_source_bundle",
    args: [bundleId],
    jsonSafeReturn: true,
    leaderOnly: true,
  });
}

export async function readFreshnessCheck(checkId: string, options: ChainReadOptions = {}) {
  const client = createFreshnessClient(options.walletAddress);
  return client.readContract({
    address: contractAddress(options.contractAddress),
    functionName: "get_freshness_check",
    args: [checkId],
    jsonSafeReturn: true,
    leaderOnly: true,
  });
}

export async function registerSourceBundle({
  walletAddress,
  subject,
  expectedUpdateCadence,
  primarySourceUrl,
  secondarySourceUrl,
  referenceSourceUrl,
  maxStalenessHours,
  contractAddress: overrideAddress,
}: SourceBundleInput) {
  const client = createFreshnessWriteClient(walletAddress);
  await connectStudionet(client);
  const address = contractAddress(overrideAddress);
  const hash = await client.writeContract({
    address,
    functionName: "register_source_bundle",
    args: [subject, expectedUpdateCadence, primarySourceUrl, secondarySourceUrl, referenceSourceUrl, maxStalenessHours],
    value: BigInt(0),
    leaderOnly: false,
  });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    fullTransaction: true,
  });
  const bundleId = idFromReceipt(receipt, /bundle_[a-f0-9]{20}/, "source bundle");
  const { data: bundle, warning: readbackWarning } = await tryReadback(() =>
    readSourceBundle(bundleId, { walletAddress, contractAddress: address }),
  );
  return { hash, receipt, bundleId, bundle, readbackWarning };
}

export async function evaluateFreshness({
  walletAddress,
  bundleId,
  observationLabel,
  observedAt,
  observationUrl,
  contractAddress: overrideAddress,
}: FreshnessInput) {
  const client = createFreshnessWriteClient(walletAddress);
  await connectStudionet(client);
  const address = contractAddress(overrideAddress);
  const hash = await client.writeContract({
    address,
    functionName: "evaluate_freshness",
    args: [bundleId, observationLabel, observedAt, observationUrl],
    value: BigInt(0),
    leaderOnly: false,
  });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    fullTransaction: true,
  });
  const checkId = idFromReceipt(receipt, /fresh_[a-f0-9]{20}/, "freshness check");
  const { data: check, warning: readbackWarning } = await tryReadback(() =>
    readFreshnessCheck(checkId, { walletAddress, contractAddress: address }),
  );
  return { hash, receipt, checkId, check, readbackWarning };
}

async function tryReadback<T>(read: () => Promise<T>): Promise<{ data: T | null; warning?: string }> {
  try {
    return { data: await read() };
  } catch (error) {
    return {
      data: null,
      warning: `The transaction was accepted, but immediate readback was not available yet: ${compactError(error)}`,
    };
  }
}

export function compactError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["shortMessage", "message", "reason", "details", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // Fall through to generic message.
  }
  return "Unknown GenLayer transaction error.";
}

function idFromReceipt(receipt: unknown, pattern: RegExp, label: string): string {
  const id = collectStrings(receipt)
    .map((value) => value.match(pattern)?.[0])
    .find((value): value is string => Boolean(value));
  if (!id) {
    throw new Error(`Accepted ${label} transaction did not return its ID.`);
  }
  return id;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
}
