import { Image } from "expo-image";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radii, spacing, type AdaptivePalette } from "@manual-samur/design-tokens";
import manualIcon from "../../assets/icon.png";
import type { AcademySlot } from "../academy-slot.ts";
import { useThemedStyles } from "../theme.tsx";
import { Press } from "./Press.tsx";

const APP_BLUE = "#1B4FA8";
const APTA_PAPER = "#F7F7F2";
const APTA_GREEN = "#345D55";

export function AcademyPromo({ slot, onContinue }: { slot: AcademySlot; onContinue: () => Promise<void> }) {
  const styles = useThemedStyles(createStyles);
  const [isSaving, setIsSaving] = useState(false);
  if (!slot.splashImage) return null;

  const continueToApp = async () => {
    setIsSaving(true);
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
            {slot.splashLogo ? <Image source={slot.splashLogo} style={styles.logo} contentFit="contain" alt="Logotipo de APTA" accessibilityLabel="Logotipo de APTA" /> : null}
            <Image source={slot.splashImage} style={styles.mascot} contentFit="contain" alt="Lince azul de APTA guiando el estudio" accessibilityLabel="Lince azul de APTA guiando el estudio" />
          </View>
          <View style={styles.copy}>
            <Text style={styles.eyebrow}>Una recomendación de formación</Text>
            <Text style={styles.title}>Prepárate para las oposiciones de SAMUR-Protección Civil.</Text>
            <Text style={styles.detail}>Ruta de estudio, tests y tutor virtual para seguir avanzando.</Text>
            <Text style={styles.disclaimer}>APTA Academy es un proyecto independiente.</Text>
          </View>
          <Press
            onPress={() => void continueToApp()}
            disabled={isSaving}
            style={[styles.button, isSaving && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel={isSaving ? "Abriendo la app" : "Continuar a la app"}
            accessibilityState={{ busy: isSaving, disabled: isSaving }}
          >
            <Text style={styles.buttonText}>{isSaving ? "Abriendo…" : "Continuar a la app"}</Text>
          </Press>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(palette: AdaptivePalette) {
  return {
    screen: { flex: 1, backgroundColor: APP_BLUE },
    content: { flexGrow: 1, justifyContent: "space-between", gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
    appIdentity: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xs },
    appIcon: { width: 40, height: 40, borderRadius: 11 },
    appName: { color: palette.white, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
    promoCard: { flexGrow: 1, justifyContent: "space-between", gap: spacing.lg, backgroundColor: APTA_PAPER, borderRadius: radii.lg, padding: spacing.lg },
    brandBlock: { alignItems: "center", gap: spacing.sm },
    logo: { width: "62%", height: 45 },
    mascot: { width: "65%", height: 205 },
    copy: { alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xs },
    eyebrow: { color: APTA_GREEN, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, textAlign: "center", textTransform: "uppercase" },
    title: { color: palette.ink, fontSize: 26, lineHeight: 30, fontWeight: "800", letterSpacing: -0.6, textAlign: "center" },
    detail: { color: APTA_GREEN, fontSize: 15, lineHeight: 21, fontWeight: "700", textAlign: "center" },
    disclaimer: { color: palette.inkMuted, fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: spacing.xs },
    button: { width: "100%", minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radii.md, backgroundColor: palette.ink, paddingHorizontal: spacing.lg },
    buttonText: { color: palette.white, fontSize: 15, fontWeight: "800" },
    disabled: { opacity: 0.6 },
  } as const;
}
