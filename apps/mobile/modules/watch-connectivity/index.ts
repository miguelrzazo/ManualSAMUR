import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

/**
 * iPhone → Apple Watch fallback channel.
 *
 * The Watch app normally downloads the public snapshot itself. When it cannot (no
 * Wi-Fi/LTE, backend unreachable) the iPhone can push the copy it already has. Call
 * `sendSnapshotToWatch` whenever the iPhone activates a verified snapshot (bundled or
 * downloaded); it is cheap to call repeatedly: the transfer is skipped when the same
 * hash is already queued and older queued snapshots are cancelled.
 *
 * Contract consumed by targets/watch (PhoneContentReceiver.swift): a JSON
 * `samur-manual.mobile-content` envelope with `schema`, `version`, `generatedAt`,
 * `hash` and `content.{codes,drugs,commercialNames,status4}`. Extra keys are ignored.
 */

export type WatchTransferResult =
  | { queued: true }
  | { queued: false; reason: "unsupported" | "inactive" | "not-paired" | "watch-app-not-installed" | "write-failed" };

export type WatchSessionState = {
  supported: boolean;
  activated?: boolean;
  paired?: boolean;
  watchAppInstalled?: boolean;
  reachable?: boolean;
  outstandingTransfers?: number;
};

/** Minimal shape needed from the iPhone's snapshot; `MobileSnapshot` satisfies it. */
export type WatchSnapshotSource = {
  schema: string;
  version: number;
  generatedAt: string;
  hash: string;
  content: {
    codes: unknown;
    drugs: unknown;
    commercialNames?: unknown;
    status4: unknown;
  };
};

type NativeWatchBridge = {
  getState(): WatchSessionState;
  sendContent(json: string, hash: string, generatedAt: string): Promise<WatchTransferResult>;
  addListener(event: "onContentRequested", listener: (event: { hash: string }) => void): { remove(): void };
};

const native = Platform.OS === "ios" ? requireOptionalNativeModule<NativeWatchBridge>("WatchConnectivityBridge") : null;

export function getWatchSessionState(): WatchSessionState {
  return native?.getState() ?? { supported: false };
}

/** Trims the snapshot to what the Watch shows (~330 KB instead of ~4.5 MB) and queues it. */
export async function sendSnapshotToWatch(snapshot: WatchSnapshotSource): Promise<WatchTransferResult> {
  if (!native) return { queued: false, reason: "unsupported" };
  const trimmed = {
    schema: snapshot.schema,
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    hash: snapshot.hash,
    content: {
      codes: snapshot.content.codes,
      drugs: snapshot.content.drugs,
      commercialNames: snapshot.content.commercialNames ?? [],
      status4: snapshot.content.status4,
    },
  };
  return native.sendContent(JSON.stringify(trimmed), snapshot.hash, snapshot.generatedAt);
}

/**
 * Fired when the Watch app asks for data (it does so after a failed network refresh,
 * if the iPhone app is in the foreground). Respond with `sendSnapshotToWatch`.
 */
export function addWatchContentRequestListener(listener: (event: { hash: string }) => void): { remove(): void } {
  if (!native) return { remove() {} };
  return native.addListener("onContentRequested", listener);
}
