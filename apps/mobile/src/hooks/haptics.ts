import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Thin wrapper so call sites never have to think about platform or failure.
 *
 * Haptics are feedback, never the only feedback: every call here sits alongside
 * a visible state change (a filled star, a selected chip, a rendered result).
 * Errors are swallowed because a device without a taptic engine, or one in Low
 * Power Mode, must not take an interaction down with it.
 */
function fire(run: () => Promise<void>) {
  if (Platform.OS === "web") return;
  run().catch(() => {});
}

/** Tab, chip, segment and filter changes. */
export function selectionTick() {
  fire(() => Haptics.selectionAsync());
}

/** Toggling a favourite, expanding a group. */
export function lightImpact() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A calculation completing with a usable result. */
export function successNotice() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** A calculation refusing to run, or a download failing. */
export function warningNotice() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
