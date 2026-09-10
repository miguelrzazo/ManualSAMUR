import { radii, spacing, type AdaptivePalette } from "@manual-samur/design-tokens";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { readableContentChange } from "../../../../packages/manual-content/src/content-diff.ts";
import { Press } from "./Press.tsx";

export function UpdateDiff({ diff, palette, compact = false }: { diff: string; palette: AdaptivePalette; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = useMemo(() => readableContentChange(diff), [diff]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  if (parsed.before.length === 0 && parsed.after.length === 0) return null;
  return (
    <View style={[styles.container, compact && styles.compact]}>
      <Press onPress={() => setExpanded((value) => !value)} style={styles.header} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={expanded ? "Ocultar qué cambió" : "Ver qué cambió"}>
        <Text style={styles.action}>{expanded ? "Ocultar" : "Ver qué cambió"}</Text>
      </Press>
      {expanded && <View style={styles.comparison}>{parsed.before.length > 0 && <View style={styles.before}><Text style={styles.eyebrow}>Antes</Text><Text style={styles.beforeText}>{parsed.before.join("\n")}</Text></View>}{parsed.after.length > 0 && <View style={styles.after}><Text style={styles.eyebrow}>Ahora</Text><Text style={styles.afterText}>{parsed.after.join("\n")}</Text></View>}</View>}
    </View>
  );
}

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    container: { marginTop: spacing.xs, gap: spacing.xs },
    compact: { marginTop: 0 },
    header: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "flex-start" },
    action: { color: palette.primary, fontSize: 12, fontWeight: "800" },
    comparison: { gap: spacing.sm },
    before: { borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surfaceMuted, padding: spacing.md },
    after: { borderRadius: radii.md, borderWidth: 1, borderColor: palette.primary, backgroundColor: palette.primaryWash, padding: spacing.md },
    eyebrow: { color: palette.inkMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4, textTransform: "uppercase" },
    beforeText: { color: palette.inkMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
    afterText: { color: palette.ink, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  });
}
