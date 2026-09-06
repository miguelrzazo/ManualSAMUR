import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radii, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import React from "react";
import { Linking, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { accessibilityHints } from "../accessibility.ts";
import type { SyncProgress, SyncState } from "../content.tsx";
import { contentFreshness, type StagedPackage } from "../content-transaction.ts";
import type { AppearancePreference } from "../preferences-logic.ts";
import {
  PENDING_SETTINGS_LEGAL_METADATA,
  isPendingSettingsMetadata,
  type SettingsLegalMetadata,
} from "../settings-legal.ts";
import { useTheme } from "../theme.tsx";
import { Press } from "./Press.tsx";

const OFFICIAL_MANUAL_URL = "https://servpub.madrid.es/manualsamur/bin/view/Main/";

export interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onCancelRefresh: () => void;
  onResumeStaged: () => Promise<void>;
  onDiscardStaged: () => Promise<void>;
  onOpenAbbreviations: () => void;
  generatedAt: string;
  packageHash?: string;
  isRefreshing: boolean;
  lastError?: string;
  syncState: SyncState;
  syncProgress: SyncProgress;
  stagedPackage?: StagedPackage;
  appearance: AppearancePreference;
  setAppearance: (preference: AppearancePreference) => void;
  appVersion: string;
  legalMetadata?: SettingsLegalMetadata;
  reduceMotion?: boolean;
}

type SyncStatus = { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; title: string; detail: string; color: keyof AdaptivePalette };

function syncStatus(syncState: SyncState, generatedAt: string): SyncStatus {
  switch (syncState) {
    case "checking": return { icon: "cloud-search-outline", title: "Buscando actualizaciones", detail: "Consultando el paquete publicado", color: "primary" };
    case "downloading": return { icon: "cloud-download-outline", title: "Descargando contenido", detail: "El contenido anterior sigue disponible", color: "primary" };
    case "validating": return { icon: "shield-check-outline", title: "Verificando el paquete", detail: "Comprobando integridad antes de activarlo", color: "primary" };
    case "activating": return { icon: "database-sync-outline", title: "Activando contenido", detail: "Finalizando la actualización", color: "primary" };
    case "success": return { icon: "check-circle-outline", title: "Contenido actualizado", detail: "Paquete verificado y activo", color: "green" };
    case "offline": return { icon: "cloud-off-outline", title: "Sin conexión", detail: "Puedes seguir usando el contenido local", color: "amber" };
    case "failure": return { icon: "alert-circle-outline", title: "No se pudo actualizar", detail: "El contenido anterior permanece activo", color: "danger" };
    case "recovery": return { icon: "backup-restore", title: "Actualización pendiente", detail: "Puedes reanudarla o descartarla", color: "amber" };
    case "stale": return { icon: "clock-alert-outline", title: "Conviene buscar actualizaciones", detail: "El contenido local tiene más de 30 días", color: "amber" };
    default: return contentFreshness(generatedAt) === "fresh"
      ? { icon: "check-decagram-outline", title: "Contenido local disponible", detail: "Revisión reciente", color: "green" }
      : { icon: "clock-alert-outline", title: "Conviene buscar actualizaciones", detail: "Revisa si hay un paquete más reciente", color: "amber" };
  }
}

function formattedDate(value: string): string {
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? time.toLocaleDateString("es-ES") : "Fecha no disponible";
}

export function SettingsModal({
  visible, onClose, onRefresh, onCancelRefresh, onResumeStaged, onDiscardStaged,
  onOpenAbbreviations, generatedAt, packageHash, isRefreshing, lastError, syncState,
  syncProgress, stagedPackage, appearance, setAppearance, appVersion,
  legalMetadata = PENDING_SETTINGS_LEGAL_METADATA, reduceMotion = false,
}: SettingsModalProps) {
  const palette = useTheme();
  const styles = useStyles(palette);
  const status = syncStatus(syncState, generatedAt);
  const progress = syncProgress.totalBytes && syncProgress.downloadedBytes !== undefined
    ? Math.min(100, Math.round((syncProgress.downloadedBytes / syncProgress.totalBytes) * 100))
    : undefined;

  return (
    <Modal visible={visible} animationType={reduceMotion ? "none" : "slide"} presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header} accessibilityRole="header">
            <Text style={styles.title}>Información y ajustes</Text>
            <Press onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Cerrar información y ajustes" accessibilityHint={accessibilityHints.dismiss}>
              <Text style={styles.closeText}>Cerrar</Text>
            </Press>
          </View>

          <SectionTitle>Contenido y actualización</SectionTitle>
          <View style={styles.card} accessible accessibilityLabel={`${status.title}. ${lastError ?? status.detail}`} accessibilityLiveRegion="polite">
            <MaterialCommunityIcons name={status.icon} size={26} color={palette[status.color]} />
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>{status.title}</Text>
              <Text style={styles.meta}>{lastError ?? status.detail}</Text>
              <Text style={styles.revision}>{formattedDate(generatedAt)} · revisión {packageHash?.slice(0, 10) ?? "no disponible"}</Text>
              {progress !== undefined ? (
                <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
              ) : null}
            </View>
          </View>
          {isRefreshing ? (
            <Press onPress={onCancelRefresh} disabled={syncState === "activating"} style={[styles.primaryButton, syncState === "activating" && styles.disabled]} accessibilityRole="button" accessibilityState={{ disabled: syncState === "activating", busy: true }}>
              <Text style={styles.primaryButtonText}>{syncState === "activating" ? "Aplicando actualización…" : "Cancelar actualización"}</Text>
            </Press>
          ) : (
            <Press onPress={() => void onRefresh()} style={styles.primaryButton} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>Buscar actualización</Text>
            </Press>
          )}
          {stagedPackage ? (
            <View style={styles.recovery} accessibilityLiveRegion="polite">
              <Text style={styles.meta}>Hay un paquete descargado pendiente. El contenido anterior sigue protegido.</Text>
              <View style={styles.actions}>
                <Press onPress={() => void onResumeStaged()} disabled={isRefreshing} style={styles.secondaryButton} accessibilityRole="button"><Text style={styles.secondaryButtonText}>Reanudar</Text></Press>
                <Press onPress={() => void onDiscardStaged()} disabled={isRefreshing} style={styles.secondaryButton} accessibilityRole="button"><Text style={styles.secondaryButtonText}>Descartar</Text></Press>
              </View>
            </View>
          ) : null}

          <SectionTitle>Preferencias</SectionTitle>
          <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Apariencia de la aplicación">
            {(["system", "light", "dark"] as const).map((option) => {
              const selected = appearance === option;
              const label = option === "system" ? "Sistema" : option === "light" ? "Claro" : "Oscuro";
              return <Press key={option} onPress={() => setAppearance(option)} style={[styles.segmentOption, selected && styles.segmentOptionSelected]} accessibilityRole="radio" accessibilityState={{ selected }}><Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label}</Text></Press>;
            })}
          </View>
          <Press onPress={onOpenAbbreviations} style={styles.card} accessibilityRole="button" accessibilityLabel="Abrir abreviaturas">
            <MaterialCommunityIcons name="format-letter-case" size={25} color={palette.green} />
            <View style={styles.copy}><Text style={styles.rowTitle}>Abreviaturas</Text><Text style={styles.meta}>Consulta local por abreviatura o significado</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={21} color={palette.inkMuted} />
          </Press>

          <SectionTitle>Privacidad y alcance</SectionTitle>
          <Notice icon="lock-outline" title="Datos en el dispositivo">No necesita cuenta ni está diseñada para registrar datos de pacientes. Favoritos, recientes y preferencias se guardan localmente.</Notice>
          <Notice icon="map-marker-radius-outline" title="Ubicación bajo petición">La ubicación se solicita al usar la función de cercanía del mapa. El directorio puede consultarse sin concederla.</Notice>
          <Notice icon="shield-alert-outline" title="Referencia independiente">Adaptación digital no oficial. No implica afiliación, aprobación ni representación de SAMUR-Protección Civil.</Notice>
          <Notice icon="medical-bag" title="Apoyo a la consulta">El contenido y los cálculos son material de referencia. No sustituyen protocolos vigentes, instrucciones operativas ni criterio profesional.</Notice>
          <Press onPress={() => void Linking.openURL(OFFICIAL_MANUAL_URL)} style={styles.linkRow} accessibilityRole="link"><Text style={styles.linkText}>Abrir fuente oficial del manual</Text><MaterialCommunityIcons name="open-in-new" size={18} color={palette.primary} /></Press>

          <SectionTitle>Legal y soporte</SectionTitle>
          <MetadataRow label="Entidad editora" value={legalMetadata.publisher} />
          <MetadataLink label="Política de privacidad" value={legalMetadata.privacyPolicyUrl} />
          <MetadataLink label="Soporte" value={legalMetadata.supportUrl} />
          <MetadataLink label="Contacto" value={legalMetadata.supportEmail} email />
          <View style={styles.versionRow}><Text style={styles.meta}>Versión de la app</Text><Text style={styles.rowTitle}>{appVersion}</Text></View>
          <Text style={styles.legal}>ManualSAMUR y SAMUR-Protección Civil son referencias de sus titulares.</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  function MetadataLink({ label, value, email = false }: { label: string; value: string; email?: boolean }) {
    const pending = isPendingSettingsMetadata(value);
    if (pending) return <MetadataRow label={label} value={value} />;
    return <Press onPress={() => void Linking.openURL(email ? `mailto:${value}` : value)} style={styles.metadataRow} accessibilityRole="link"><View style={styles.copy}><Text style={styles.meta}>{label}</Text><Text style={styles.linkText}>{value}</Text></View><MaterialCommunityIcons name="open-in-new" size={18} color={palette.primary} /></Press>;
  }

  function MetadataRow({ label, value }: { label: string; value: string }) {
    const pending = isPendingSettingsMetadata(value);
    return <View style={styles.metadataRow} accessible accessibilityLabel={`${label}. ${pending ? "Pendiente de publicación" : value}`}><View style={styles.copy}><Text style={styles.meta}>{label}</Text><Text style={styles.rowTitle}>{pending ? "Pendiente de publicación" : value}</Text></View>{pending ? <View style={styles.pendingBadge}><Text style={styles.pendingText}>Pendiente</Text></View> : null}</View>;
  }

  function Notice({ icon, title, children }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; title: string; children: React.ReactNode }) {
    return <View style={styles.notice}><MaterialCommunityIcons name={icon} size={22} color={palette.primary} /><View style={styles.copy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.meta}>{children}</Text></View></View>;
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const palette = useTheme();
  const styles = useStyles(palette);
  return <Text style={styles.sectionTitle} accessibilityRole="header">{children}</Text>;
}

function useStyles(palette: AdaptivePalette) {
  return React.useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.paper },
    content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.sm },
    title: { ...typography.title2, color: palette.ink, flex: 1 },
    closeButton: { justifyContent: "center", paddingHorizontal: spacing.sm },
    closeText: { ...typography.headline, color: palette.primary },
    sectionTitle: { ...typography.subheadline, fontWeight: "600", color: palette.inkMuted, marginTop: spacing.md, textTransform: "uppercase", letterSpacing: 0.3 },
    card: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 64, padding: spacing.lg, borderRadius: radii.md, backgroundColor: palette.surface },
    copy: { flex: 1, gap: 2 },
    rowTitle: { ...typography.callout, fontWeight: "600", color: palette.ink },
    meta: { ...typography.footnote, color: palette.inkMuted },
    revision: { ...typography.caption, color: palette.inkMuted, marginTop: spacing.xs, fontVariant: ["tabular-nums"] },
    progressTrack: { height: 6, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted, overflow: "hidden", marginTop: spacing.sm },
    progressFill: { height: "100%", backgroundColor: palette.primary, borderRadius: radii.pill },
    primaryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radii.md, paddingHorizontal: spacing.lg, backgroundColor: palette.primaryAction },
    primaryButtonText: { ...typography.headline, color: palette.white },
    disabled: { opacity: 0.55 },
    recovery: { padding: spacing.lg, borderRadius: radii.md, gap: spacing.md, backgroundColor: palette.amberWash },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    secondaryButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: palette.lineStrong, backgroundColor: palette.surface },
    secondaryButtonText: { ...typography.callout, fontWeight: "600", color: palette.primary },
    segment: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    segmentOption: { flexGrow: 1, minWidth: 96, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: palette.lineStrong, borderRadius: radii.pill, paddingHorizontal: spacing.md, backgroundColor: palette.surface },
    segmentOptionSelected: { backgroundColor: palette.primaryAction, borderColor: palette.primaryAction },
    segmentText: { ...typography.callout, fontWeight: "600", color: palette.ink },
    segmentTextSelected: { color: palette.white },
    notice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.lg, borderRadius: radii.md, backgroundColor: palette.surface },
    linkRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radii.md, backgroundColor: palette.surface },
    linkText: { ...typography.callout, color: palette.primary, flexShrink: 1 },
    metadataRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.md, backgroundColor: palette.surface },
    pendingBadge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: palette.amberWash },
    pendingText: { ...typography.caption, fontWeight: "600", color: palette.amber },
    versionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    legal: { ...typography.caption, color: palette.inkMuted, textAlign: "center", marginTop: spacing.sm },
  }), [palette]);
}

