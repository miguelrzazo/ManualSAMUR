import { MaterialCommunityIcons } from "@expo/vector-icons";
import { circle, radii, shadows, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import React from "react";
import { Linking, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { accessibilityHints } from "../accessibility.ts";
import type { SyncProgress, SyncState } from "../content.tsx";
import { contentFreshness, type StagedPackage } from "../content-transaction.ts";
import type { AppearancePreference } from "../preferences-logic.ts";
import {
  ABOUT_AUTHOR,
  ADAPTATION_DISCLAIMER,
  SETTINGS_LEGAL_METADATA,
  isPendingSettingsMetadata,
  type SettingsLegalMetadata,
} from "../settings-legal.ts";
import { useTheme } from "../theme.tsx";
import { Press } from "./Press.tsx";
import { PageHeader } from "./PageHeader.tsx";
import { shouldShowAcademyEntry } from "../academy-slot.ts";
import { academySlot } from "../academy-slot-config.ts";

/**
 * Ajustes.
 *
 * Lo que había: una cabecera con el título a la izquierda y un "Cerrar" de texto a la
 * derecha; y, bajo "Privacidad y alcance", cuatro tarjetas seguidas —"Datos en el
 * dispositivo", "Ubicación bajo petición", "Referencia independiente", "Apoyo a la
 * consulta"— que decían dos cosas repartidas en cuatro párrafos: los datos se quedan
 * aquí, y esto no es oficial ni sustituye a nada. Cuatro avisos seguidos no se leen:
 * se pasan.
 *
 * Lo que hay: cada cosa dicha una vez. El aviso de uso es el mismo texto que la web
 * (`ADAPTATION_DISCLAIMER`), palabra por palabra, para que la app y el sitio no se
 * presenten distinto. Los enlaces oficiales salen de `content.links` —el paquete ya los
 * trae— en vez de una constante escrita a mano aquí, que era una quinta copia de la URL
 * del manual. Y "Sobre mí", colaboradores y el contacto de feedback estaban sólo en la
 * web; ahora también aquí, que es donde alguien los busca desde el teléfono.
 */

export interface SettingsLinks {
  sourceUrl: string;
  avisoImportanteUrl: string;
  samurEmail: string;
  officialWebUrl: string;
  collaboratorsUrl: string;
}

export interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onCancelRefresh: () => void;
  onActivateStaged: () => Promise<void>;
  onDiscardStaged: () => Promise<void>;
  onOpenAbbreviations: () => void;
  onOpenChangelog: () => void;
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
  links: SettingsLinks;
  /** Origen del sitio web, del que cuelgan la lista de colaboradores y las páginas legales. */
  contentOrigin: string;
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
    case "recovery": return { icon: "backup-restore", title: "Actualización pendiente", detail: "Puedes activarla o descartarla", color: "amber" };
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
  visible, onClose, onRefresh, onCancelRefresh, onActivateStaged, onDiscardStaged,
  onOpenAbbreviations, onOpenChangelog, generatedAt, packageHash, isRefreshing, lastError, syncState,
  syncProgress, stagedPackage, appearance, setAppearance, appVersion, links, contentOrigin,
  legalMetadata = SETTINGS_LEGAL_METADATA, reduceMotion = false,
}: SettingsModalProps) {
  const palette = useTheme();
  const styles = useStyles(palette);
  const status = syncStatus(syncState, generatedAt);
  const progress = syncProgress.totalBytes && syncProgress.downloadedBytes !== undefined
    ? Math.min(100, Math.round((syncProgress.downloadedBytes / syncProgress.totalBytes) * 100))
    : undefined;
  const open = (url: string) => void Linking.openURL(url);

  return (
    <Modal visible={visible} animationType={reduceMotion ? "none" : "slide"} presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]} accessibilityViewIsModal>
        {/* La misma cabecera que las pestañas, con el cierre como icono en su hueco
            `trailing`. El "Cerrar" de texto era el único de la app y competía con el
            título por el ancho. */}
        <PageHeader
          title="Ajustes"
          trailing={
            <Press onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Cerrar ajustes" accessibilityHint={accessibilityHints.dismiss}>
              <MaterialCommunityIcons name="close" size={24} color={palette.ink} />
            </Press>
          }
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionTitle>Contenido</SectionTitle>
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
              <Text style={styles.meta}>Hay una actualización verificada pendiente. El contenido anterior sigue activo hasta que la confirmes.</Text>
              <View style={styles.actions}>
                <Press onPress={() => void onActivateStaged()} disabled={isRefreshing} style={styles.secondaryButton} accessibilityRole="button"><Text style={styles.secondaryButtonText}>Activar actualización</Text></Press>
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
          <Row icon="format-letter-case" tint={palette.green} title="Abreviaturas" meta="Consulta local por abreviatura o significado" onPress={onOpenAbbreviations} />

          {academySlot && shouldShowAcademyEntry(academySlot) && (
            <>
              {/* La formación es un enlace externo y la creatividad del arranque
                  es local: Ajustes sigue funcionando sin cobertura. */}
              <SectionTitle>Formación</SectionTitle>
              <Row icon="school-outline" tint={palette.primary} title={academySlot.title} meta={academySlot.detail} external onPress={() => open(String(academySlot?.url))} />
            </>
          )}

          <SectionTitle>Aviso de uso</SectionTitle>
          {/* Un aviso, no cuatro. Era "Referencia independiente" + "Apoyo a la consulta"
              diciendo lo mismo en dos tarjetas seguidas; este es el texto que la web
              lleva publicado desde el principio. */}
          <Notice icon="shield-alert-outline">{ADAPTATION_DISCLAIMER}</Notice>
          <Notice icon="medical-bag">El contenido y los cálculos son material de referencia: no sustituyen a los protocolos vigentes, a las instrucciones operativas ni al criterio profesional.</Notice>

          <SectionTitle>Enlaces oficiales</SectionTitle>
          <Row icon="alert-outline" tint={palette.amber} title="Aviso importante" meta="Documento oficial en PDF" external onPress={() => open(links.avisoImportanteUrl)} />
          <Row icon="book-open-variant" tint={palette.primary} title="Manual oficial" meta="Fuente de todo el contenido de esta app" external onPress={() => open(links.sourceUrl)} />
          <Row icon="account-group-outline" tint={palette.primary} title="Colaboradores" meta="Quiénes escribieron el manual original" external onPress={() => open(`${contentOrigin}/colaboradores`)} />
          <Row icon="web" tint={palette.primary} title="SAMUR-Protección Civil" meta="Web del Ayuntamiento de Madrid" external onPress={() => open(links.officialWebUrl)} />
          <Row icon="email-outline" tint={palette.primary} title="Escribir a SAMUR" meta={links.samurEmail} external onPress={() => open(`mailto:${links.samurEmail}`)} />

          <SectionTitle>Sobre mí</SectionTitle>
          <View style={styles.card}>
            <View style={styles.avatar}><Text style={styles.avatarText}>MR</Text></View>
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>{ABOUT_AUTHOR.name}</Text>
              <Text style={styles.meta}>{ABOUT_AUTHOR.blurb}</Text>
            </View>
          </View>
          <Row icon="message-alert-outline" tint={palette.primary} title="Enviar comentarios" meta={legalMetadata.supportEmail || "Correo de contacto"} external onPress={() => open(`mailto:${legalMetadata.supportEmail}`)} />
          <Row icon="github" tint={palette.ink} title="GitHub" meta="Código y seguimiento de incidencias" external onPress={() => open(ABOUT_AUTHOR.githubUrl)} />

          <SectionTitle>Privacidad y soporte</SectionTitle>
          {/* Dos tarjetas fundidas en una: la promesa es una sola —nada sale del
              teléfono— y se leía repartida entre "Datos en el dispositivo" y
              "Ubicación bajo petición". */}
          <Notice icon="lock-outline">No necesita cuenta y no está diseñada para registrar datos de pacientes. Favoritos, recientes y preferencias se guardan en el dispositivo. La ubicación se pide solo al usar la cercanía del mapa; el directorio funciona sin concederla.</Notice>
          <MetadataLink label="Política de privacidad" value={legalMetadata.privacyPolicyUrl} />
          <MetadataLink label="Soporte" value={legalMetadata.supportUrl} />
          <MetadataRow label="Entidad editora" value={legalMetadata.publisher} />

          {/* La versión abre el registro de cambios. Era una línea de texto muerta al
              final de la lista, y es lo primero que se mira cuando algo va raro. */}
          <Press onPress={onOpenChangelog} style={styles.versionRow} accessibilityRole="button" accessibilityLabel={`Versión ${appVersion}. Ver novedades`} accessibilityHint="Abre el registro de cambios de la aplicación.">
            <View style={styles.copy}>
              <Text style={styles.meta}>Versión de la app</Text>
              <Text style={styles.rowTitle}>{appVersion}</Text>
            </View>
            <Text style={styles.linkText}>Novedades</Text>
            <MaterialCommunityIcons name="chevron-right" size={21} color={palette.inkMuted} />
          </Press>
          <Text style={styles.legal}>ManualSAMUR y SAMUR-Protección Civil son referencias de sus titulares.</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  /** Una fila de ajustes: icono, título, meta, y el chevrón o el icono de salida. */
  function Row({ icon, tint, title, meta, onPress, external = false }: {
    icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
    tint: string;
    title: string;
    meta: string;
    onPress: () => void;
    external?: boolean;
  }) {
    return (
      <Press onPress={onPress} style={styles.card} accessibilityRole={external ? "link" : "button"} accessibilityLabel={title} accessibilityHint={external ? "Se abre fuera de la aplicación." : undefined}>
        <MaterialCommunityIcons name={icon} size={25} color={tint} />
        <View style={styles.copy}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.meta} numberOfLines={2}>{meta}</Text>
        </View>
        <MaterialCommunityIcons name={external ? "open-in-new" : "chevron-right"} size={external ? 19 : 21} color={palette.inkMuted} />
      </Press>
    );
  }

  function MetadataLink({ label, value }: { label: string; value: string }) {
    if (isPendingSettingsMetadata(value)) return <MetadataRow label={label} value={value} />;
    return (
      <Press onPress={() => open(value)} style={styles.metadataRow} accessibilityRole="link" accessibilityLabel={label}>
        <View style={styles.copy}><Text style={styles.meta}>{label}</Text><Text style={styles.linkText} numberOfLines={1}>{value}</Text></View>
        <MaterialCommunityIcons name="open-in-new" size={18} color={palette.primary} />
      </Press>
    );
  }

  function MetadataRow({ label, value }: { label: string; value: string }) {
    const pending = isPendingSettingsMetadata(value);
    return (
      <View style={styles.metadataRow} accessible accessibilityLabel={`${label}. ${pending ? "Pendiente de publicación" : value}`}>
        <View style={styles.copy}><Text style={styles.meta}>{label}</Text><Text style={styles.rowTitle}>{pending ? "Pendiente de publicación" : value}</Text></View>
        {pending ? <View style={styles.pendingBadge}><Text style={styles.pendingText}>Pendiente</Text></View> : null}
      </View>
    );
  }

  function Notice({ icon, children }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; children: React.ReactNode }) {
    return <View style={styles.notice}><MaterialCommunityIcons name={icon} size={22} color={palette.inkMuted} /><Text style={styles.noticeText}>{children}</Text></View>;
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
    content: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
    closeButton: { ...circle(44), alignItems: "center", justifyContent: "center" },
    sectionTitle: { ...typography.subheadline, fontWeight: "600", color: palette.inkMuted, marginTop: spacing.lg, marginBottom: spacing.xs, textTransform: "uppercase", letterSpacing: 0.3 },
    card: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 64, padding: spacing.lg, borderRadius: radii.md, backgroundColor: palette.surface, ...shadows.card, shadowColor: palette.black },
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
    // El aviso no es una tarjeta: es texto sobre el papel, con su icono al margen. Un
    // aviso con la misma superficie y la misma sombra que una fila pulsable se lee como
    // una fila pulsable que no responde.
    notice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
    noticeText: { flex: 1, ...typography.footnote, color: palette.inkMuted },
    avatar: { ...circle(40), backgroundColor: palette.primaryWash, alignItems: "center", justifyContent: "center" },
    avatarText: { ...typography.footnote, fontWeight: "700", color: palette.primary },
    linkText: { ...typography.callout, color: palette.primary, flexShrink: 1 },
    metadataRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.md, backgroundColor: palette.surface },
    pendingBadge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: palette.amberWash },
    pendingText: { ...typography.caption, fontWeight: "600", color: palette.amber },
    versionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 58, marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.md, backgroundColor: palette.surface },
    legal: { ...typography.caption, color: palette.inkMuted, textAlign: "center", marginTop: spacing.sm },
  }), [palette]);
}
