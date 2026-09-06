import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radii, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { accessibilityHints } from "../accessibility.ts";
import { useTheme } from "../theme.tsx";
import { Press } from "./Press.tsx";

/**
 * One search field, in two modes.
 *
 * There were four implementations — two of them byte-identical apart from the
 * placeholder — plus a fifth read-only variant. `readOnly` covers the case where
 * the field is really a button that opens the search modal.
 *
 * The old version drew an unexplained 8px green dot inside the field with no
 * label or legend anywhere in the app. It is gone: an offline-first app does not
 * need to announce that it is working.
 */
export function SearchField({ value, onChangeText, onPress, onSubmitEditing, placeholder, readOnly = false, autoFocus = false }: {
  value?: string;
  onChangeText?: (value: string) => void;
  onPress?: () => void;
  /** Fired on the keyboard's search key — where Buscar records the query as recent. */
  onSubmitEditing?: () => void;
  placeholder: string;
  readOnly?: boolean;
  autoFocus?: boolean;
}) {
  const palette = useTheme();
  const styles = useStyles(palette);

  if (readOnly) {
    return (
      <Press onPress={onPress} style={styles.field} accessibilityRole="button" accessibilityLabel={placeholder} accessibilityHint={accessibilityHints.openDetail}>
        <MaterialCommunityIcons name="magnify" size={20} color={palette.inkMuted} />
        <Text style={styles.placeholder} numberOfLines={1}>{placeholder}</Text>
      </Press>
    );
  }

  return (
    <View style={styles.field}>
      <MaterialCommunityIcons name="magnify" size={20} color={palette.inkMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.inkMuted}
        style={styles.input}
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        clearButtonMode="while-editing"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        accessibilityHint={accessibilityHints.search}
      />
    </View>
  );
}

function useStyles(palette: AdaptivePalette) {
  return React.useMemo(() => StyleSheet.create({
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      backgroundColor: palette.surfaceMuted,
    },
    input: { flex: 1, ...typography.body, color: palette.ink, paddingVertical: 0 },
    placeholder: { flex: 1, ...typography.body, color: palette.inkMuted },
  }), [palette]);
}
