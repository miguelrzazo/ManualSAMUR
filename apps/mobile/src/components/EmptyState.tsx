import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { spacing, typography } from "@manual-samur/design-tokens";
import { useTheme } from "../theme.tsx";

/**
 * Three implementations, two of them identical, collapsed into one.
 *
 * `detail` is optional and should stay optional: several empty states carried a
 * paragraph explaining the app to the user ("Tus favoritos y recientes
 * permanecen en este dispositivo. No se sincronizan con una cuenta."). A good
 * empty state names what is missing; it does not document the architecture.
 */
export function EmptyState({ title, detail, icon = "text-search" }: {
  title: string;
  detail?: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}) {
  const palette = useTheme();
  return (
    <View style={styles.container} accessible accessibilityRole="text" accessibilityLabel={detail ? `${title}. ${detail}` : title}>
      <MaterialCommunityIcons name={icon} size={28} color={palette.inkMuted} />
      <Text style={[styles.title, { color: palette.ink }]}>{title}</Text>
      {detail ? <Text style={[styles.detail, { color: palette.inkMuted }]}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  title: { ...typography.headline, textAlign: "center" },
  detail: { ...typography.subheadline, textAlign: "center" },
});
