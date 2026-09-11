import { radii, spacing, type AdaptivePalette } from "@manual-samur/design-tokens";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { readableContentChange, readableUpdateViewModel } from "../../../../packages/manual-content/src/content-diff.ts";
import type { MobileUpdateEvent } from "../../../../packages/manual-content/src/schema.ts";
import { Press } from "./Press.tsx";

export function UpdateDiff({ diff, event, palette, compact = false }: { diff?: string; event?: MobileUpdateEvent; palette: AdaptivePalette; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const view = useMemo(() => event ? readableUpdateViewModel(event) : undefined, [event]);
  const parsedDiff = useMemo(() => readableContentChange(diff), [diff]);
  const parsed = view?.comparison ?? parsedDiff;
  const styles = useMemo(() => createStyles(palette), [palette]);
  if (view?.scope === "procedimiento") return <CompleteProcedureChange view={view} palette={palette} compact={compact} />;
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

function CompleteProcedureChange({ view, palette, compact }: { view: ReturnType<typeof readableUpdateViewModel>; palette: AdaptivePalette; compact: boolean }) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const retired = view.changeLabel === "Contenido retirado";
  const completeLabel = retired
    ? "Procedimiento completo retirado"
    : view.changeLabel === "Contenido añadido" ? "Procedimiento completo añadido" : "Procedimiento completo actualizado";
  return (
    <View style={[styles.complete, retired ? styles.completeRetired : styles.completeAdded, compact && styles.compact]} accessibilityLabel={`${view.changeLabel}: ${view.title}`}>
      <View style={styles.completeHeader}>
        <View style={styles.completeCopy}>
          <Text style={[styles.eyebrow, retired ? styles.retiredText : styles.addedText]}>{completeLabel}</Text>
          <Text style={[styles.completeTitle, retired ? styles.retiredText : styles.addedText]}>{view.title}</Text>
        </View>
        {view.sections.length > 0 && <Text style={[styles.sectionCount, retired ? styles.retiredText : styles.addedText]}>{view.sections.length} {view.sections.length === 1 ? "apartado" : "apartados"}</Text>}
      </View>
      {view.sections.length > 0 ? (
        <View style={styles.sectionList}>
          {view.sections.map((section) => (
            <View key={`${section.title}-${section.body}`} style={styles.sectionSummary}>
              <Text style={[styles.sectionTitle, retired ? styles.retiredText : styles.addedText]}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
        </View>
      ) : <Text style={styles.sectionBody}>{retired ? "Este procedimiento ya no forma parte del paquete activo." : "El procedimiento completo está disponible en el paquete activo."}</Text>}
      {view.replacementGuidance && <Text style={styles.guidance}>{view.replacementGuidance}</Text>}
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
    complete: { marginTop: spacing.xs, borderRadius: radii.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
    completeAdded: { borderColor: palette.green, backgroundColor: palette.greenWash },
    completeRetired: { borderColor: palette.danger, backgroundColor: palette.dangerWash },
    completeHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    completeCopy: { flex: 1, gap: spacing.xs },
    completeTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800" },
    sectionCount: { fontSize: 11, lineHeight: 16, fontWeight: "800" },
    sectionList: { gap: spacing.xs },
    sectionSummary: { borderRadius: radii.sm, backgroundColor: palette.surface, padding: spacing.sm, gap: 2 },
    sectionTitle: { fontSize: 13, lineHeight: 18, fontWeight: "800" },
    sectionBody: { color: palette.ink, fontSize: 13, lineHeight: 19 },
    guidance: { color: palette.inkMuted, fontSize: 12, lineHeight: 18 },
    addedText: { color: palette.green },
    retiredText: { color: palette.danger },
  });
}
