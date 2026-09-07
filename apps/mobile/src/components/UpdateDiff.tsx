import { spacing, type AdaptivePalette } from "@manual-samur/design-tokens";
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
        <Text style={styles.action}>{expanded ? "Ocultar cambios" : "Ver cambios"}</Text>
      </Press>
      {expanded && <View style={styles.lines}>{parsed.lines.map((line, index) => <Text key={`${index}-${line.text}`} style={[styles.line, line.kind === "added" && styles.added, line.kind === "removed" && styles.removed, line.kind === "hunk" && styles.hunk]}>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}{line.text}</Text>)}</View>}
    </View>
  );
}

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    container: { marginTop: spacing.xs, gap: spacing.xs },
    compact: { marginTop: 0 },
    header: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "flex-start" },
    action: { color: palette.primary, fontSize: 12, fontWeight: "800" },
    lines: { gap: 3, borderLeftWidth: 2, borderLeftColor: palette.line, paddingLeft: spacing.sm },
    line: { color: palette.inkMuted, fontFamily: "Courier", fontSize: 11, lineHeight: 16 },
    added: { color: palette.green },
    removed: { color: palette.danger },
    hunk: { color: palette.primary, fontWeight: "800" },
  });
}
