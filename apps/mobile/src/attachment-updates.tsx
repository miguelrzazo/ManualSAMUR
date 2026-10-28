import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as Network from "expo-network";
import { AppState } from "react-native";
import type { MobileAttachment, MobileContent } from "../../../packages/manual-content/src/index.ts";
import { automaticAttachmentDownloadsAllowed, isAttachmentUnavailableUpstream, isLocallyAvailable, isReadableOffline } from "./attachment-logic";
import { downloadOptionalAttachment, reconcileAttachmentRecord } from "./attachment-runtime";

type State = { running: boolean; available: number; total: number; bytes: number; pending: number; error?: string };
const initial: State = { running: false, available: 0, total: 0, bytes: 0, pending: 0 };
const Context = createContext<{ state: State; downloadNow: () => Promise<void> }>({ state: initial, downloadNow: async () => {} });
export const useAttachmentUpdates = () => useContext(Context);

/** Runs while the app is active; no background-execution entitlement is implied. */
export function AttachmentUpdatesProvider({ content, enabled, children }: { content: MobileContent; enabled: boolean; children: React.ReactNode }) {
  const [state, setState] = useState<State>(initial);
  const controller = useRef<AbortController | null>(null);
  const manual = useRef(false);
  const rerun = useRef(false);
  const latestRun = useRef<(allowMobileData?: boolean) => Promise<void>>(async () => {});
  const items = useRef<MobileAttachment[]>([]);
  const attachments = useMemo(() => [...new Map(content.procedures.flatMap((procedure) => procedure.attachments).filter((attachment) => !isAttachmentUnavailableUpstream(attachment)).map((attachment) => [attachment.id, attachment])).values()], [content.procedures]);
  useEffect(() => { items.current = attachments; }, [attachments]);
  const run = useCallback(async (allowMobileData = false) => {
    if (!enabled || AppState.currentState !== "active") return;
    if (controller.current) { rerun.current = true; return; }
    const network = await Network.getNetworkStateAsync().catch(() => undefined);
    const canDownload = allowMobileData
      ? Boolean(network?.isConnected && network.isInternetReachable !== false)
      : automaticAttachmentDownloadsAllowed(network);
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    manual.current = allowMobileData;
    const summary: State = { ...initial, running: true, total: items.current.length };
    setState({ ...summary });
    try {
      for (const attachment of items.current) {
        if (abort.signal.aborted) break;
        let record = await reconcileAttachmentRecord(attachment);
        if (canDownload && !isLocallyAvailable(record, attachment)) record = await downloadOptionalAttachment(attachment, { signal: abort.signal });
        if (isReadableOffline(record)) { summary.available++; summary.bytes += record.byteLength ?? 0; }
        if (!isLocallyAvailable(record, attachment)) { summary.pending++; summary.error = record.error; }
        setState({ ...summary });
      }
    } catch (error) {
      summary.error = error instanceof Error ? error.message : "No se pudieron actualizar los anexos.";
    } finally {
      controller.current = null;
      setState({ ...summary, running: false });
      if (rerun.current) { rerun.current = false; setTimeout(() => void latestRun.current(), 0); }
    }
  }, [enabled]);
  useEffect(() => { latestRun.current = run; }, [run]);
  useEffect(() => {
    if (!enabled) return;
    void run();
    const subscription = Network.addNetworkStateListener((network) => {
      if (network.type !== Network.NetworkStateType.WIFI && !manual.current) controller.current?.abort();
      void run();
    });
    const app = AppState.addEventListener("change", (status) => {
      if (status === "active") void run();
      else controller.current?.abort();
    });
    return () => { controller.current?.abort(); subscription.remove(); app.remove(); };
  }, [content, enabled, run]);
  return <Context.Provider value={{ state, downloadNow: () => run(true) }}>{children}</Context.Provider>;
}
