import * as Crypto from "expo-crypto";

import type { ContentSnapshot } from "./types";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function isContentSnapshot(value: unknown): value is ContentSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ContentSnapshot>;
  return snapshot.schema === "samur-manual.mobile-content"
    && snapshot.version === 1
    && typeof snapshot.hash === "string"
    && Boolean(snapshot.content)
    && Array.isArray(snapshot.content?.procedures)
    && Array.isArray(snapshot.content?.drugs)
    && Array.isArray(snapshot.content?.hospitals);
}

export async function hasValidContentHash(snapshot: ContentSnapshot): Promise<boolean> {
  const computed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, stableJson(snapshot.content));
  return computed === snapshot.hash;
}

export async function shouldReplaceCachedSnapshot(currentHash: string | undefined, candidate: unknown, advertisedHash: string): Promise<boolean> {
  return currentHash !== advertisedHash
    && isContentSnapshot(candidate)
    && candidate.hash === advertisedHash
    && hasValidContentHash(candidate);
}
