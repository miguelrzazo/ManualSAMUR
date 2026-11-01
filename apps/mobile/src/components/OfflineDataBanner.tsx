import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radii, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { adaptiveLayout } from "../accessibility";
import { useContentData, useContentSync } from "../content-context";
import { formatDataDate, isOfflineWithStaleData } from "../content-update-logic";
import { useTheme } from "../theme";

/**
 * Aviso discreto "sin conexión con datos sin verificar".
 *
 * Solo aparece cuando la última comprobación no pudo llegar al servidor y lo
 * que se muestra es la semilla incluida en la app o datos que el servidor no
 * ha confirmado en las últimas 24 h. Flota sobre la barra de pestañas, no
 * desplaza contenido, deja pasar los toques alrededor y se cierra al tocarlo
 * (vuelve si cambia el estado). Lo monta el propio ContentProvider para no
 * tocar la navegación.
 */
export function OfflineDataBanner() {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  // Narrow: float just above the bottom tab capsules. Wide: there is no bottom bar (the
  // tabs are a rail on the left), so sit near the bottom edge, centred on the content
  // column rather than across the rail.
  const layout = adaptiveLayout(width, fontScale);
  const placement = layout.isWideLayout
    ? { bottom: insets.bottom + spacing.lg, left: layout.railWidth + insets.left }
    : { bottom: insets.bottom + 84 };
  const { snapshot } = useContentData();
  const { lastCheck, isSeed, release, isHydrated } = useContentSync();
  const [dismissedFor, setDismissedFor] = useState<string>();
  const visible = isHydrated && isOfflineWithStaleData(lastCheck, isSeed);
  const key = `${lastCheck?.checkedAt ?? ""}:${snapshot.hash}`;
  if (!visible || dismissedFor === key) return null;
  const date = formatDataDate(release?.publishedAt ?? snapshot.generatedAt);
  const message = isSeed
    ? `Sin conexión · Datos incluidos en la app (${date})`
    : `Sin conexión · Datos del ${date} sin verificar`;
  return (
    <View pointerEvents="box-none" style={[styles.host, placement]}>
      <Pressable
        testID="offline-data-banner"
        onPress={() => setDismissedFor(key)}
        style={styles.pill}
        accessibilityRole="button"
        accessibilityLabel={message}
        accessibilityHint="Toca para ocultar el aviso."
        accessibilityLiveRegion="polite"
      >
        <MaterialCommunityIcons name="cloud-off-outline" size={16} color={palette.amber} />
        <Text style={styles.text} numberOfLines={2}>{message}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    host: { position: "absolute", left: 0, right: 0, alignItems: "center", paddingHorizontal: spacing.lg },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      maxWidth: 520,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      backgroundColor: palette.amberWash,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.amber,
    },
    text: { ...typography.footnote, color: palette.amber, fontWeight: "600", flexShrink: 1 },
  });
}
