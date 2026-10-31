import { useEffect, useRef } from "react";
import { addWatchContentRequestListener, sendSnapshotToWatch } from "../modules/watch-connectivity";
import { useContentData } from "./content-context";

/**
 * Keeps the Apple Watch app supplied with the iPhone's active snapshot, as a fallback
 * for when the Watch cannot reach the backend itself. Renders nothing.
 *
 * Mounted once inside <ContentProvider>. It only depends on `useContentData().snapshot`;
 * if the data layer changes, keep exposing the active, verified snapshot there (or call
 * `sendSnapshotToWatch(snapshot)` directly wherever a snapshot is activated).
 */
export function WatchSnapshotSync(): null {
  const { snapshot } = useContentData();
  const latest = useRef(snapshot);

  useEffect(() => {
    latest.current = snapshot;
    sendSnapshotToWatch(snapshot).catch(() => undefined);
    // Re-sending the same hash is a no-op on the native side.
  }, [snapshot]);

  useEffect(() => {
    const subscription = addWatchContentRequestListener(() => {
      sendSnapshotToWatch(latest.current).catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
