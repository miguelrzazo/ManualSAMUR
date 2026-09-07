import { radii, spacing, type AdaptivePalette } from "@manual-samur/design-tokens";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { parseUnifiedDiff } from "../manual-tree-logic.ts";
import { Press } from "./Press.tsx";

export function UpdateDiff({ diff, palette, compact = false }: { diff: string; palette: AdaptivePalette; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={[styles.container, compact && styles.compact]}>
      <Press onPress={() => setExpanded((value) => !value)} style={styles.header} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={expanded ? "Ocultar cambios" : "Mostrar cambios"}>
        <Text style={styles.summary}>+{parsed.added} −{parsed.removed} cambios</Text>
        <Text style={styles.action}>{expanded ? "Ocultar" : "Ver cambios"}</Text>
      </Press>
      {expanded && <View style={styles.lines}>{parsed.lines.map((line, index) => <Text key={`${index}-${line.text}`} style={[styles.line, line.kind === "added" && styles.added, line.kind === "removed" && styles.removed, line.kind === "hunk" && styles.hunk]}>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}{line.text}</Text>)}</View>}
    </View>
  );
}

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    container: { backgroundColor: palette.ink, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
    compact: { borderRadius: radii.sm },
    header: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    summary: { color: palette.white, fontSize: 12, fontWeight: "800" },
    action: { color: palette.primary, fontSize: 12, fontWeight: "800" },
    lines: { gap: 3 },
    line: { color: "#CAD5E4", fontFamily: "Courier", fontSize: 11, lineHeight: 16 },
    added: { color: "#8BE5B8" },
    removed: { color: "#FF9AA1" },
    hunk: { color: "#8FB6F5", fontWeight: "800" },
  });
}
