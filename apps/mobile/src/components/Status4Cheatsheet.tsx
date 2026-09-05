import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { radii, spacing } from "@manual-samur/design-tokens";
import type { AdaptivePalette } from "../accessibility";
import { accessibilityTargetStyle } from "../accessibility";
import type { CodigosHospital, Status4Entry } from "../codigos-logic";

interface Props {
  status4: Status4Entry[];
  hospitals: CodigosHospital[];
  palette: AdaptivePalette;
  onSelectHospital?: (hospital: CodigosHospital) => void;
}

/**
 * Reusable Status 4 cheatsheet: after a unit reports Status 4, the following
 * status number determines the automatic destination hospital. Mirrors
 * `components/mapa/Status4Cheatsheet.tsx` content so the web and mobile app
 * teach the same lookup. A later ticket also surfaces this from the Mapa
 * screen — this component takes no navigation dependency so it can be reused
 * there unchanged.
 */
export function Status4Cheatsheet({ status4, hospitals, palette, onSelectHospital }: Props) {
  const styles = createStyles(palette);
  const hospitalById = new Map(hospitals.map((h) => [h.id, h]));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Hoja de referencia Status 4
        </Text>
        <Text style={styles.subtitle}>
          Tras enviar Status 4, el siguiente status determina el hospital de destino automático.
        </Text>
      </View>

      <View style={styles.notice} accessibilityRole="text">
        <MaterialCommunityIcons name="alert-outline" size={19} color={palette.amber} />
        <Text style={styles.noticeText}>
          Cuando el traslado se realice a la Maternidad o al Hospital Infantil de alguno de estos hospitales, se
          informará por voz y por canal 1 a continuación de enviar la clave 4 y el status correspondiente. Cuando las
          unidades hagan clave 4 a cualquier otro hospital que no esté en este listado, se comunicará por voz (canal
          3).
        </Text>
      </View>

      <FlatList
        data={status4}
        keyExtractor={(entry) => String(entry.status)}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const hospital = item.hospitalId ? (hospitalById.get(item.hospitalId) ?? null) : null;
          const label = hospital
            ? `Status 4 más ${item.status}. ${hospital.shortName || hospital.name}, ${hospital.district}`
            : `Status 4 más ${item.status}. No operativo, solo pasa clave cuatro`;
          const content = (
            <View style={styles.row}>
              <View style={styles.codePair}>
                <Text style={styles.codeFour}>4</Text>
                <Text style={styles.codePlus}>+</Text>
                <Text style={styles.codeStatus}>{item.status}</Text>
              </View>
              <MaterialCommunityIcons name="arrow-right" size={16} color={palette.inkMuted} style={styles.arrow} />
              {hospital ? (
                <View style={styles.destination}>
                  <Text style={styles.destinationTitle}>{hospital.shortName || hospital.name}</Text>
                  <Text style={styles.destinationMeta}>
                    {item.hospitalId} — {hospital.district}
                  </Text>
                </View>
              ) : (
                <View style={styles.destination}>
                  <Text style={styles.destinationInactive}>No operativo</Text>
                  <Text style={styles.destinationMeta}>Solo pasa clave cuatro</Text>
                </View>
              )}
            </View>
          );
          return hospital && onSelectHospital ? (
            <Pressable
              onPress={() => onSelectHospital(hospital)}
              style={[styles.pressableRow, accessibilityTargetStyle()]}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint="Abre la ficha de este hospital."
            >
              {content}
            </Pressable>
          ) : (
            <View style={styles.pressableRow} accessible accessibilityRole="text" accessibilityLabel={label}>
              {content}
            </View>
          );
        }}
      />
    </View>
  );
}

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    container: { paddingVertical: spacing.md },
    header: { marginBottom: spacing.lg },
    title: { color: palette.ink, fontSize: 18, fontWeight: "800" },
    subtitle: { color: palette.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
    notice: {
      flexDirection: "row",
      gap: spacing.sm,
      backgroundColor: palette.amberWash,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    noticeText: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 17 },
    pressableRow: { minHeight: 44, justifyContent: "center", borderRadius: radii.sm },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
    codePair: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 52 },
    codeFour: {
      fontFamily: "System",
      fontWeight: "800",
      fontSize: 12,
      color: palette.ink,
      backgroundColor: palette.surfaceMuted,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    codePlus: { color: palette.inkMuted, fontSize: 11 },
    codeStatus: {
      fontWeight: "800",
      fontSize: 12,
      color: palette.amber,
      backgroundColor: palette.amberWash,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    arrow: { flexShrink: 0 },
    destination: { flex: 1 },
    destinationTitle: { color: palette.ink, fontSize: 14, fontWeight: "700" },
    destinationInactive: { color: palette.inkMuted, fontSize: 14, fontWeight: "600" },
    destinationMeta: { color: palette.inkMuted, fontSize: 11, marginTop: 1 },
  });
}
