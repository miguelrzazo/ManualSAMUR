import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";

import { commonStyles } from "@/constants/theme";

export function PressableCard({ children, onPress, style, accessibilityLabel }: PropsWithChildren<{ onPress: () => void; style?: ViewStyle; accessibilityLabel?: string }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [commonStyles.card, style, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}
const styles = StyleSheet.create({ pressed: { opacity: .76, transform: [{ scale: .985 }] } });
