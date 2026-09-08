import { Image } from "expo-image";
import React, { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radii, spacing, type AdaptivePalette } from "@manual-samur/design-tokens";
import manualIcon from "../../assets/icon.png";
import type { AcademySlot } from "../academy-slot.ts";
import { useThemedStyles } from "../theme.tsx";
import { Press } from "./Press.tsx";

const APTA_GREEN = "#345D55";

export function AcademyPromo({ slot, onContinue }: { slot: AcademySlot; onContinue: () => Promise<void> }) {
  const styles = useThemedStyles(createStyles);
  const [isSaving, setIsSaving] = useState(false);
  if (!slot.splashImage) return null;

  const continueToApp = async () => {
    setIsSaving(true);
    await onContinue();
  };

  const openAcademy = async () => {
    setIsSaving(true);
    await Linking.openURL(slot.url);
    await onContinue();
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.appIdentity} accessibilityRole="header" accessibilityLabel="Manual SAMUR">
          <Image source={manualIcon} style={styles.appIcon} contentFit="contain" alt="Icono de Manual SAMUR" accessibilityLabel="Icono de Manual SAMUR" />
          <Text style={styles.appName}>Manual SAMUR</Text>
        </View>
        <View style={styles.promoCard} accessibilityLabel="Promoción de APTA Academy">
          <View style={styles.brandBlock}>
            <Text style={styles.academyName}>{slot.title}</Text>
            <Image source={slot.splashImage} style={styles.mascot} contentFit="contain" alt="Lince azul de APTA guiando el estudio" accessibilityLabel="Lince azul de APTA guiando el estudio" />
          </View>
          <View style={styles.copy}>
            <Text style={styles.eyebrow}>Una recomendación de formación</Text>
            <Text style={styles.title}>Prepárate para las oposiciones de SAMUR-Protección Civil.</Text>
            <Text style={styles.detail}>Ruta de estudio, tests y tutor virtual para seguir avanzando.</Text>
            <Text style={styles.disclaimer}>APTA Academy es un proyecto independiente.</Text>
          </View>
          <View style={styles.actions}>
            <Press
              onPress={() => void openAcademy()}
              disabled={isSaving}
              style={[styles.button, isSaving && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel={isSaving ? "Abriendo APTA Academy" : "Ir a APTA Academy"}
              accessibilityState={{ busy: isSaving, disabled: isSaving }}
            >
              <Text style={styles.buttonText}>{isSaving ? "Abriendo…" : "Ir a APTA Academy"}</Text>
            </Press>
            <Press
              onPress={() => void continueToApp()}
              disabled={isSaving}
              style={[styles.secondaryButton, isSaving && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="Continuar a la app"
              accessibilityState={{ busy: isSaving, disabled: isSaving }}
            >
              <Text style={styles.secondaryButtonText}>Continuar a la app</Text>
            </Press>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(palette: AdaptivePalette) {
  return {
    screen: { flex: 1, backgroundColor: palette.paper },
    content: { flexGrow: 1, justifyContent: "space-between", gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
    appIdentity: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xs },
    appIcon: { width: 40, height: 40, borderRadius: 11 },
    appName: { color: palette.ink, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
    promoCard: { flexGrow: 1, justifyContent: "space-between", gap: spacing.lg, backgroundColor: palette.surface, borderColor: palette.line, borderRadius: radii.lg, borderWidth: 1, padding: spacing.lg },
    brandBlock: { alignItems: "center", gap: spacing.sm },
    academyName: { color: palette.primary, fontSize: 23, fontWeight: "900", letterSpacing: -0.5 },
    mascot: { width: "65%", height: 205 },
    copy: { alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xs },
    eyebrow: { color: APTA_GREEN, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, textAlign: "center", textTransform: "uppercase" },
    title: { color: palette.ink, fontSize: 26, lineHeight: 30, fontWeight: "800", letterSpacing: -0.6, textAlign: "center" },
    detail: { color: APTA_GREEN, fontSize: 15, lineHeight: 21, fontWeight: "700", textAlign: "center" },
    disclaimer: { color: palette.inkMuted, fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: spacing.xs },
    actions: { width: "100%", gap: spacing.sm },
    button: { width: "100%", minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radii.md, backgroundColor: palette.primaryAction, paddingHorizontal: spacing.lg },
    buttonText: { color: palette.white, fontSize: 15, fontWeight: "800" },
    secondaryButton: { width: "100%", minHeight: 48, alignItems: "center", justifyContent: "center", borderColor: palette.lineStrong, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.lg },
    secondaryButtonText: { color: palette.ink, fontSize: 15, fontWeight: "800" },
    disabled: { opacity: 0.6 },
  } as const;
}
