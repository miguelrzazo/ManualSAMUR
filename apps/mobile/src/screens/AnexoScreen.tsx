import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Pdf from "react-native-pdf";
import { radii, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle } from "../accessibility";
import { useTheme } from "../theme";
import { useContent } from "../content";
import {
  attachmentStatusLabel,
  isAttachmentUnavailableUpstream,
  isLocallyAvailable,
  type AttachmentRecord,
} from "../attachment-logic";
import { downloadOptionalAttachment, reconcileAttachmentRecord } from "../attachment-runtime";
import type { MobileAttachment } from "../data/schema";
import type { RootStackParamList } from "../navigation-types";

/**
 * The anexo viewer.
 *
 * Anexos used to be a list of rows that downloaded a file and then handed it to the OS
 * with `Linking.openURL`, which on iOS drops the reader into Preview outside the app —
 * losing the back button, the procedure they were reading, and several seconds. Most of
 * these files are not even remote: the approved essential allowlist bundles them into the
 * binary (`bundledAttachmentUri` → `Paths.bundle`), so the wait was for nothing.
 *
 * This screen renders the document itself. A bundled or already-downloaded anexo appears
 * immediately; anything else downloads here, with progress, and swaps to the document in
 * place. The external "fuente oficial" link survives as the recovery path for the eight
 * anexos that are confirmed gone upstream, and only for those.
 */
export function AnexoScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Anexo">) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { content } = useContent();

  const attachment = useMemo(() => findAttachment(content.procedures, route.params.attachmentId), [content.procedures, route.params.attachmentId]);
  const [record, setRecord] = useState<AttachmentRecord>();
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<{ downloaded: number; total?: number }>();
  const [pages, setPages] = useState<{ current: number; total: number }>();
  const controller = useRef<AbortController>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: attachment?.filename ?? "Anexo", headerLargeTitle: false });
  }, [attachment?.filename, navigation]);

  const load = useCallback(async (target: MobileAttachment) => {
    setError(undefined);
    const reconciled = await reconcileAttachmentRecord(target);
    if (isLocallyAvailable(reconciled, target) && reconciled.localUri) {
      setRecord(reconciled);
      return;
    }
    if (isAttachmentUnavailableUpstream(target)) {
      setRecord(reconciled);
      setError(reconciled.error);
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setRecord({ ...reconciled, status: "downloading" });
    try {
      const next = await downloadOptionalAttachment(target, {
        signal: abort.signal,
        onProgress: (downloaded, total) => setProgress({ downloaded, total }),
      });
      setRecord(next);
      if (next.status !== "available") setError(next.error ?? "No se pudo abrir el anexo.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el anexo.");
    } finally {
      controller.current = null;
      setProgress(undefined);
    }
  }, []);

  useEffect(() => {
    if (!attachment) return;
    let cancelled = false;
    const start = setTimeout(() => { if (!cancelled) void load(attachment); }, 0);
    return () => {
      cancelled = true;
      clearTimeout(start);
      controller.current?.abort();
    };
  }, [attachment, load]);

  if (!attachment) {
    return (
      <View style={styles.centered}>
        <MaterialCommunityIcons name="file-alert-outline" size={30} color={palette.inkMuted} />
        <Text style={styles.message}>Este anexo no está en el paquete local.</Text>
      </View>
    );
  }

  const uri = record?.localUri;
  const ready = Boolean(uri) && isLocallyAvailable(record, attachment);

  if (error) {
    return (
      <ScrollView contentContainerStyle={styles.centered}>
        <MaterialCommunityIcons name="alert-circle-outline" size={30} color={palette.danger} />
        <Text style={styles.message}>{error}</Text>
        <Pressable
          onPress={() => void Linking.openURL(attachment.sourceUrl)}
          style={[styles.action, accessibilityTargetStyle()]}
          accessibilityRole="link"
          accessibilityLabel="Abrir la fuente oficial del anexo"
          accessibilityHint={accessibilityHints.openMap}
        >
          <Text style={styles.actionText}>Abrir fuente oficial</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!ready) {
    const percentage = progress?.total ? Math.round((progress.downloaded / progress.total) * 100) : undefined;
    return (
      <View style={styles.centered} accessibilityLiveRegion="polite">
        <ActivityIndicator color={palette.primary} />
        <Text style={styles.message}>
          {percentage === undefined ? attachmentStatusLabel(record?.status ?? "not-downloaded") : `Descargando… ${percentage}%`}
        </Text>
        {percentage !== undefined && (
          <View style={styles.progressTrack} accessibilityLabel={`Descarga al ${percentage} por ciento`}>
            <View style={[styles.progressFill, { width: `${percentage}%` }]} />
          </View>
        )}
      </View>
    );
  }

  if (attachment.kind === "image") {
    return (
      <ScrollView
        contentContainerStyle={styles.imageScroll}
        maximumZoomScale={4}
        minimumZoomScale={1}
        centerContent
      >
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="contain"
          accessible
          alt={`Anexo ${attachment.filename}`}
          accessibilityLabel={`Anexo ${attachment.filename}`}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.fill} accessibilityLabel={`Anexo ${attachment.filename}`}>
      <Pdf
        source={{ uri }}
        style={styles.fill}
        trustAllCerts={false}
        onLoadComplete={(total) => setPages({ current: 1, total })}
        onPageChanged={(current, total) => setPages({ current, total })}
        onError={() => setError("No se pudo mostrar el PDF. Puedes abrir la fuente oficial.")}
      />
      {pages && pages.total > 1 && (
        <View style={styles.pageBadge} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={styles.pageBadgeText} maxFontSizeMultiplier={1.4}>{pages.current} / {pages.total}</Text>
        </View>
      )}
    </View>
  );
}

function findAttachment(procedures: { attachments: MobileAttachment[] }[], id: string): MobileAttachment | undefined {
  for (const procedure of procedures) {
    const match = procedure.attachments.find((attachment) => attachment.id === id);
    if (match) return match;
  }
  return undefined;
}

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: palette.paper },
    centered: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl, backgroundColor: palette.paper },
    message: { ...typography.callout, color: palette.ink, textAlign: "center" },
    action: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radii.md, backgroundColor: palette.primaryAction },
    actionText: { ...typography.footnote, fontWeight: "600", color: palette.white },
    progressTrack: { width: "70%", height: 4, borderRadius: 2, backgroundColor: palette.surfaceMuted, overflow: "hidden" },
    progressFill: { height: 4, backgroundColor: palette.primary },
    imageScroll: { flexGrow: 1, justifyContent: "center", backgroundColor: palette.paper },
    image: { width: "100%", aspectRatio: 1, backgroundColor: palette.paper },
    pageBadge: { position: "absolute", bottom: spacing.lg, alignSelf: "center", paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: palette.ink },
    pageBadgeText: { ...typography.footnote, fontWeight: "600", color: palette.paper, fontVariant: ["tabular-nums"] },
  });
}
