/**
 * PROTOTYPE — issue 85: redesigned update history.
 *
 * Three throwaway variants of the same question: should update history feel
 * like a readable Git branch, with commits, chronology, and diffs? This screen
 * is dev-only and intentionally uses in-memory fixture data. It is not a
 * production implementation of the update protocol.
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radii, shadows, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { accessibilityTargetStyle } from "../accessibility";
import { useTheme } from "../theme";
import type { RootStackParamList } from "../navigation-types";

type Props = NativeStackScreenProps<RootStackParamList, "HistoryPrototype">;
type Variant = "A" | "B" | "C";
type Surface = "global" | "detail";
type HistoryTab = "novedades" | "historial";
type Category = "Procedimientos" | "Vademécum" | "Códigos";

type PrototypeEvent = {
  id: string;
  date: string;
  category: Category;
  kind: "NUEVO" | "ACTUALIZADO" | "ELIMINADO";
  ref: string;
  title: string;
  summary: string;
  diff: string[];
  affected: string[];
};

const EVENTS: PrototypeEvent[] = [
  {
    id: "commit-309-03",
    date: "04 jun 2026",
    category: "Procedimientos",
    kind: "ACTUALIZADO",
    ref: "309_03",
    title: "Edema agudo de pulmón",
    summary: "Actualizado el manejo de la ventilación y la perfusión de nitroglicerina.",
    diff: ["@@ tratamiento · líneas 17–32", "- Mantener SatO2 > 92%", "+ Mantener SatO2 > 90%", "+ Añadida pauta de perfusión en bomba"],
    affected: ["309_03 · Edema agudo de pulmón"],
  },
  {
    id: "commit-414-01",
    date: "28 may 2026",
    category: "Procedimientos",
    kind: "ACTUALIZADO",
    ref: "414_01",
    title: "Crisis hipertensiva",
    summary: "Reordenada la actitud diagnóstica y terapéutica.",
    diff: ["@@ actitud terapéutica", "- ## 1. Urgencias hipertensivas", "+ ### Actitud terapéutica", "+ Separados escenarios sintomático y asintomático"],
    affected: ["414_01 · Crisis hipertensiva", "309_02c · Insuficiencia cardiaca aguda"],
  },
  {
    id: "commit-status-4",
    date: "15 may 2026",
    category: "Códigos",
    kind: "NUEVO",
    ref: "status-4",
    title: "Status 4",
    summary: "Nueva referencia operativa de comunicaciones.",
    diff: ["@@ códigos · comunicaciones", "+ Status 4", "+ Situación controlada / disponible"],
    affected: ["Status 4 · Código operativo"],
  },
  {
    id: "commit-adrenalina",
    date: "03 may 2026",
    category: "Vademécum",
    kind: "ACTUALIZADO",
    ref: "adrenalina",
    title: "Adrenalina",
    summary: "Actualizada la ficha de referencia y sus concentraciones publicadas.",
    diff: ["@@ ficha · presentación", "- 1 mg / 1 ml", "+ 1 mg / 1 ml · concentración confirmada", "+ Añadida fuente de la ficha"],
    affected: ["Adrenalina · Vademécum"],
  },
  {
    id: "commit-101",
    date: "21 abr 2026",
    category: "Procedimientos",
    kind: "ELIMINADO",
    ref: "101",
    title: "Organigrama de guardia",
    summary: "Retirada una versión antigua del anexo operativo.",
    diff: ["@@ anexos", "- organigrama-2025.pdf", "+ organigrama-2026.pdf"],
    affected: ["101 · Organigrama de guardia"],
  },
];

const VARIANT_NAMES: Record<Variant, string> = {
  A: "Timeline de commits",
  B: "Bandeja de novedades",
  C: "Rama y diff",
};

const DETAIL_TARGETS: Array<{ key: string; category: Category; label: string; subtitle: string; eventRefs: string[] }> = [
  { key: "procedure", category: "Procedimientos", label: "309_03", subtitle: "Edema agudo de pulmón", eventRefs: ["309_03"] },
  { key: "drug", category: "Vademécum", label: "Adrenalina", subtitle: "Ficha de referencia", eventRefs: ["adrenalina"] },
  { key: "code", category: "Códigos", label: "Status 4", subtitle: "Código operativo", eventRefs: ["status-4"] },
];

export function HistoryPrototypeScreen({ navigation }: Props) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [variant, setVariant] = useState<Variant>("A");
  const [surface, setSurface] = useState<Surface>("global");
  const [tab, setTab] = useState<HistoryTab>("novedades");
  const [detailTarget, setDetailTarget] = useState(DETAIL_TARGETS[0].key);
  const [seen, setSeen] = useState<Set<string>>(new Set(["commit-101"]));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "Todas">("Todas");

  const recentEvents = EVENTS.slice(0, 4);
  const allVisibleEvents = tab === "novedades" ? recentEvents : EVENTS;
  const filteredEvents = allVisibleEvents.filter((event) => {
    const matchesCategory = category === "Todas" || event.category === category;
    const haystack = `${event.title} ${event.summary} ${event.ref} ${event.category}`.toLocaleLowerCase("es");
    return matchesCategory && haystack.includes(query.toLocaleLowerCase("es"));
  });
  const detail = DETAIL_TARGETS.find((item) => item.key === detailTarget) ?? DETAIL_TARGETS[0];
  const detailEvents = EVENTS.filter((event) => detail.eventRefs.includes(event.ref));
  const unreadCount = recentEvents.filter((event) => !seen.has(event.id)).length;

  const openEvent = (eventId: string) => {
    setSeen((previous) => new Set(previous).add(eventId));
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(eventId)) next.delete(eventId); else next.add(eventId);
      return next;
    });
  };

  const content = surface === "detail" ? (
    <DetailPreview
      styles={styles}
      palette={palette}
      target={detail}
      targets={DETAIL_TARGETS}
      events={detailEvents}
      seen={seen}
      expanded={expanded}
      onTargetChange={setDetailTarget}
      onOpenEvent={openEvent}
    />
  ) : (
    <>
      <View style={styles.surfaceTabs} accessibilityRole="tablist">
        {([["novedades", `Novedades${unreadCount ? ` · ${unreadCount} sin leer` : ""}`], ["historial", `Historial completo · ${EVENTS.length}`]] as const).map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.surfaceTab, tab === key && styles.surfaceTabActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
            <Text style={[styles.surfaceTabText, tab === key && styles.surfaceTabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === "historial" && (
        <View style={styles.filters}>
          <View style={styles.searchField}>
            <MaterialCommunityIcons name="magnify" size={18} color={palette.inkMuted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Buscar cambios…" placeholderTextColor={palette.inkMuted} style={styles.searchInput} accessibilityLabel="Buscar en el historial completo" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {(["Todas", "Procedimientos", "Vademécum", "Códigos"] as const).map((item) => (
              <Pressable key={item} onPress={() => setCategory(item)} style={[styles.filterChip, category === item && styles.filterChipActive]} accessibilityRole="button" accessibilityState={{ selected: category === item }}>
                <Text style={[styles.filterChipText, category === item && styles.filterChipTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      {variant === "A" && <TimelineVariant styles={styles} palette={palette} events={filteredEvents} seen={seen} expanded={expanded} onOpenEvent={openEvent} />}
      {variant === "B" && <InboxVariant styles={styles} palette={palette} events={filteredEvents} seen={seen} expanded={expanded} onOpenEvent={openEvent} unreadCount={unreadCount} />}
      {variant === "C" && <BranchVariant styles={styles} palette={palette} events={filteredEvents} seen={seen} expanded={expanded} onOpenEvent={openEvent} />}
    </>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View style={styles.eyebrowRow}><MaterialCommunityIcons name="flask-outline" size={15} color={palette.primary} /><Text style={styles.eyebrow}>PROTOTIPO · ISSUE 85</Text></View>
          <Pressable onPress={() => navigation.goBack()} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Cerrar prototipo"><MaterialCommunityIcons name="close" size={20} color={palette.ink} /></Pressable>
        </View>
        <Text style={styles.title}>Historial de actualizaciones</Text>
        <Text style={styles.subtitle}>Una rama del manual: cambios ordenados, diff legible y contexto para cada referencia.</Text>
        <View style={styles.modeToggle} accessibilityRole="tablist">
          {([["global", "Vista global"], ["detail", "Detalle de referencia"]] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setSurface(key)} style={[styles.modeOption, surface === key && styles.modeOptionActive]} accessibilityRole="tab" accessibilityState={{ selected: surface === key }}>
              <Text style={[styles.modeOptionText, surface === key && styles.modeOptionTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {surface === "global" && <View style={styles.contextRow}><View style={styles.branchPill}><MaterialCommunityIcons name="source-branch" size={15} color={palette.primary} /><Text style={styles.branchText}>manual / v1</Text></View><Text style={styles.contextText}>{unreadCount} sin leer · últimos 30 días</Text></View>}
        {content}
        <View style={styles.prototypeNote}><MaterialCommunityIcons name="information-outline" size={17} color={palette.inkMuted} /><Text style={styles.prototypeNoteText}>Datos simulados para comparar estructura. Las interacciones de lectura son temporales.</Text></View>
      </ScrollView>
      <PrototypeSwitcher variant={variant} styles={styles} onChange={setVariant} />
    </SafeAreaView>
  );
}

function TimelineVariant({ styles, palette, events, seen, expanded, onOpenEvent }: ListProps) {
  const grouped = events.reduce<Record<string, PrototypeEvent[]>>((acc, event) => { (acc[event.date] ??= []).push(event); return acc; }, {});
  return <View style={styles.variantBlock}><View style={styles.variantHeading}><View><Text style={styles.variantKicker}>VARIANTE A</Text><Text style={styles.variantTitle}>Timeline de commits</Text></View><Text style={styles.variantCount}>{events.length} cambios</Text></View><View style={styles.timeline}>{Object.entries(grouped).map(([date, dateEvents]) => <View key={date} style={styles.timelineGroup}><View style={styles.timelineDateRow}><View style={styles.timelineNode} /><Text style={styles.timelineDate}>{date}</Text></View>{dateEvents.map((event) => <EventCard key={event.id} event={event} styles={styles} palette={palette} unread={!seen.has(event.id)} expanded={expanded.has(event.id)} onOpen={() => onOpenEvent(event.id)} />)}</View>)}</View></View>;
}

function InboxVariant({ styles, palette, events, seen, expanded, onOpenEvent, unreadCount }: ListProps & { unreadCount: number }) {
  const unread = events.filter((event) => !seen.has(event.id));
  const read = events.filter((event) => seen.has(event.id));
  return <View style={styles.variantBlock}><View style={styles.variantHeading}><View><Text style={styles.variantKicker}>VARIANTE B</Text><Text style={styles.variantTitle}>Bandeja de novedades</Text></View><View style={styles.inboxCount}><Text style={styles.inboxCountNumber}>{unreadCount}</Text><Text style={styles.inboxCountLabel}>sin leer</Text></View></View><Text style={styles.sectionLabel}>Pendientes de revisar</Text>{unread.map((event) => <InboxRow key={event.id} event={event} styles={styles} palette={palette} unread expanded={expanded.has(event.id)} onOpen={() => onOpenEvent(event.id)} />)}{read.length > 0 && <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Ya revisados</Text>}{read.map((event) => <InboxRow key={event.id} event={event} styles={styles} palette={palette} unread={false} expanded={expanded.has(event.id)} onOpen={() => onOpenEvent(event.id)} />)}</View>;
}

function BranchVariant({ styles, palette, events, seen, expanded, onOpenEvent }: ListProps) {
  const [selectedId, setSelectedId] = useState(events[0]?.id);
  const selected = events.find((event) => event.id === selectedId) ?? events[0];
  return <View style={styles.variantBlock}><View style={styles.variantHeading}><View><Text style={styles.variantKicker}>VARIANTE C</Text><Text style={styles.variantTitle}>Rama y diff</Text></View><View style={styles.branchPill}><MaterialCommunityIcons name="source-branch" size={15} color={palette.primary} /><Text style={styles.branchText}>main</Text></View></View><Text style={styles.branchDescription}>Cada cambio es un commit. Selecciona un nodo para leer su diff y abrir la referencia afectada.</Text><View style={styles.branchLayout}><View style={styles.commitRail}>{events.map((event, index) => <Pressable key={event.id} onPress={() => { setSelectedId(event.id); onOpenEvent(event.id); }} style={styles.commitNodeRow} accessibilityRole="button" accessibilityLabel={`Commit ${event.title}`}><View style={styles.commitLine}><View style={[styles.commitNode, selected?.id === event.id && styles.commitNodeActive, !seen.has(event.id) && styles.commitNodeUnread]} />{index < events.length - 1 && <View style={styles.commitStem} />}</View><View style={styles.commitLabel}><Text style={[styles.commitRef, selected?.id === event.id && styles.commitRefActive]}>{event.ref}</Text><Text style={styles.commitDate}>{event.date}</Text><Text style={styles.commitTitle} numberOfLines={2}>{event.title}</Text></View></Pressable>)}</View>{selected && <View style={styles.selectedCommit}><View style={styles.selectedHeader}><View><Text style={styles.commitMeta}>COMMIT · {selected.date}</Text><Text style={styles.selectedTitle}>{selected.title}</Text></View><KindBadge kind={selected.kind} styles={styles} palette={palette} /></View><Text style={styles.selectedSummary}>{selected.summary}</Text><DiffBlock event={selected} styles={styles} palette={palette} expanded={expanded.has(selected.id)} onOpen={() => onOpenEvent(selected.id)} />{selected.affected.length > 1 && <AffectedRefs event={selected} styles={styles} palette={palette} />}</View>}</View></View>;
}

function EventCard({ event, styles, palette, unread, expanded, onOpen }: EventProps) {
  return <View style={[styles.eventCard, unread && styles.eventCardUnread]}><Pressable onPress={onOpen} style={styles.eventPress} accessibilityRole="button" accessibilityLabel={`${event.kind}: ${event.summary}`} accessibilityState={{ expanded }}>{unread && <View style={styles.unreadDot} />}<KindBadge kind={event.kind} styles={styles} palette={palette} /><View style={styles.eventCopy}><View style={styles.eventTitleRow}><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventDate}>{event.date}</Text></View><Text style={styles.eventSummary}>{event.summary}</Text><Text style={styles.eventMeta}>{event.category} · {event.affected.length} referencia{event.affected.length === 1 ? "" : "s"}</Text></View><MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={palette.inkMuted} /></Pressable>{expanded && <><DiffBlock event={event} styles={styles} palette={palette} expanded onOpen={onOpen} />{event.affected.length > 1 && <AffectedRefs event={event} styles={styles} palette={palette} />}</>}</View>;
}

function InboxRow({ event, styles, palette, unread, expanded, onOpen }: EventProps) {
  return <View style={[styles.inboxRow, unread && styles.inboxRowUnread]}><View style={styles.inboxMainRow}><Pressable onPress={onOpen} style={styles.inboxPress} accessibilityRole="button" accessibilityLabel={`${event.title}, ${event.summary}`} accessibilityState={{ expanded }}><View style={[styles.inboxStatus, unread ? styles.inboxStatusUnread : styles.inboxStatusRead]} /></Pressable><Pressable onPress={onOpen} style={styles.inboxCopy} accessibilityRole="button" accessibilityState={{ expanded }}><View style={styles.inboxTop}><Text style={styles.inboxCategory}>{event.category}</Text><Text style={styles.eventDate}>{event.date}</Text></View><Text style={styles.inboxTitle}>{event.title}</Text><Text style={styles.eventSummary} numberOfLines={2}>{event.summary}</Text></Pressable><Pressable onPress={onOpen} style={styles.inboxChevron} accessibilityRole="button" accessibilityLabel={expanded ? "Ocultar diff" : "Abrir cambio"}><MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-right"} size={18} color={palette.inkMuted} /></Pressable></View>{expanded && <View style={styles.inboxExpanded}><DiffBlock event={event} styles={styles} palette={palette} expanded onOpen={onOpen} />{event.affected.length > 1 && <AffectedRefs event={event} styles={styles} palette={palette} />}</View>}</View>;
}

function DetailPreview({ styles, palette, target, targets, events, seen, expanded, onTargetChange, onOpenEvent }: { styles: ReturnType<typeof createStyles>; palette: AdaptivePalette; target: typeof DETAIL_TARGETS[number]; targets: typeof DETAIL_TARGETS; events: PrototypeEvent[]; seen: Set<string>; expanded: Set<string>; onTargetChange: (key: string) => void; onOpenEvent: (id: string) => void }) {
  return <View style={styles.detailPreview}><Text style={styles.variantKicker}>DETALLE DE REFERENCIA</Text><Text style={styles.detailTitle}>{target.label}</Text><Text style={styles.detailSubtitle}>{target.category} · {target.subtitle}</Text><View style={styles.detailTargetRow}>{targets.map((item) => <Pressable key={item.key} onPress={() => onTargetChange(item.key)} style={[styles.detailTarget, item.key === target.key && styles.detailTargetActive]} accessibilityRole="button" accessibilityState={{ selected: item.key === target.key }}><Text style={[styles.detailTargetText, item.key === target.key && styles.detailTargetTextActive]}>{item.label}</Text></Pressable>)}</View><View style={styles.detailBody}><Text style={styles.detailBodyHeading}>Contenido de referencia</Text><Text style={styles.detailBodyText}>El contenido principal ocupa primero la pantalla. El historial vive al final, como contexto consultable cuando la pregunta es “¿qué cambió aquí?”.</Text><View style={styles.detailHistoryHeader}><View><Text style={styles.detailHistoryTitle}>Historial de cambios</Text><Text style={styles.detailHistoryMeta}>{events.length} entrada{events.length === 1 ? "" : "s"} · más reciente primero</Text></View><MaterialCommunityIcons name="source-commit" size={22} color={palette.primary} /></View>{events.length === 0 ? <Text style={styles.emptyDetail}>Sin cambios registrados.</Text> : events.map((event) => <EventCard key={event.id} event={event} styles={styles} palette={palette} unread={!seen.has(event.id)} expanded={expanded.has(event.id)} onOpen={() => onOpenEvent(event.id)} />)}</View></View>;
}

function DiffBlock({ event, styles, palette, expanded, onOpen }: { event: PrototypeEvent; styles: ReturnType<typeof createStyles>; palette: AdaptivePalette; expanded: boolean; onOpen: () => void }) {
  return <View style={styles.diffBlock}><View style={styles.diffHeader}><View style={styles.diffTitleRow}><MaterialCommunityIcons name="source-commit" size={16} color={palette.primary} /><Text style={styles.diffTitle}>Diff del commit</Text></View><Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={expanded ? "Ocultar diff" : "Ver diff"}><Text style={styles.diffAction}>{expanded ? "Ocultar" : "Ver diff"}</Text></Pressable></View><View style={styles.diffLines}>{event.diff.map((line, index) => <Text key={`${event.id}-${index}`} style={[styles.diffLine, line.startsWith("+") && styles.diffAdded, line.startsWith("-") && styles.diffRemoved, line.startsWith("@@") && styles.diffContext]}>{line}</Text>)}</View></View>;
}

function AffectedRefs({ event, styles, palette }: { event: PrototypeEvent; styles: ReturnType<typeof createStyles>; palette: AdaptivePalette }) {
  return <View style={styles.affectedBlock}><Text style={styles.affectedLabel}>REFERENCIAS AFECTADAS</Text>{event.affected.map((item) => <View key={item} style={styles.affectedRow}><MaterialCommunityIcons name="arrow-right" size={15} color={palette.primary} /><Text style={styles.affectedText}>{item}</Text></View>)}</View>;
}

function KindBadge({ kind, styles, palette }: { kind: PrototypeEvent["kind"]; styles: ReturnType<typeof createStyles>; palette: AdaptivePalette }) {
  const color = kind === "NUEVO" ? palette.green : kind === "ELIMINADO" ? palette.danger : palette.primary;
  return <View style={[styles.kindBadge, { backgroundColor: kind === "NUEVO" ? palette.greenWash : kind === "ELIMINADO" ? palette.dangerWash : palette.primaryWash }]}><View style={[styles.kindDot, { backgroundColor: color }]} /><Text style={[styles.kindText, { color }]}>{kind}</Text></View>;
}

function PrototypeSwitcher({ variant, styles, onChange }: { variant: Variant; styles: ReturnType<typeof createStyles>; onChange: (variant: Variant) => void }) {
  const variants: Variant[] = ["A", "B", "C"];
  const index = variants.indexOf(variant);
  const move = (direction: -1 | 1) => onChange(variants[(index + direction + variants.length) % variants.length]);
  return <View style={styles.switcher}><Pressable onPress={() => move(-1)} style={styles.switcherButton} accessibilityRole="button" accessibilityLabel="Variante anterior"><MaterialCommunityIcons name="chevron-left" size={22} color="#FFFFFF" /></Pressable><View style={styles.switcherLabel}><Text style={styles.switcherVariant}>{variant}</Text><Text style={styles.switcherName}>{VARIANT_NAMES[variant]}</Text></View><Pressable onPress={() => move(1)} style={styles.switcherButton} accessibilityRole="button" accessibilityLabel="Variante siguiente"><MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" /></Pressable></View>;
}

type ViewProps = { styles: ReturnType<typeof createStyles>; palette: AdaptivePalette; events: PrototypeEvent[]; seen: Set<string>; onOpenEvent: (id: string) => void };
type ListProps = ViewProps & { expanded: Set<string> };
type EventProps = { styles: ReturnType<typeof createStyles>; palette: AdaptivePalette; event: PrototypeEvent; unread: boolean; expanded: boolean; onOpen: () => void };

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.paper },
    content: { padding: spacing.lg, paddingBottom: 140, gap: spacing.md },
    topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    eyebrow: { color: palette.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
    closeButton: { ...accessibilityTargetStyle(44), alignItems: "center", justifyContent: "center" },
    title: { ...typography.title1, color: palette.ink, marginTop: spacing.sm },
    subtitle: { ...typography.subheadline, color: palette.inkMuted, lineHeight: 22 },
    modeToggle: { flexDirection: "row", backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: 4, gap: 4 },
    modeOption: { flex: 1, minHeight: 42, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
    modeOptionActive: { backgroundColor: palette.surface, ...shadows.card },
    modeOptionText: { color: palette.inkMuted, fontSize: 12, fontWeight: "700", textAlign: "center" },
    modeOptionTextActive: { color: palette.ink },
    contextRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    branchPill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: palette.primaryWash, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6 },
    branchText: { color: palette.primary, fontSize: 12, fontWeight: "800" },
    contextText: { color: palette.inkMuted, fontSize: 12 },
    surfaceTabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.line },
    surfaceTab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent", paddingHorizontal: 4 },
    surfaceTabActive: { borderBottomColor: palette.primary },
    surfaceTabText: { color: palette.inkMuted, fontSize: 12, fontWeight: "700", textAlign: "center" },
    surfaceTabTextActive: { color: palette.primary },
    filters: { gap: spacing.sm },
    searchField: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.lineStrong, borderRadius: radii.md, paddingHorizontal: spacing.md },
    searchInput: { flex: 1, color: palette.ink, fontSize: 15, paddingVertical: 8 },
    filterScroll: { gap: spacing.xs },
    filterChip: { minHeight: 34, justifyContent: "center", borderRadius: radii.pill, borderWidth: 1, borderColor: palette.lineStrong, paddingHorizontal: spacing.md, backgroundColor: palette.surface },
    filterChipActive: { backgroundColor: palette.ink, borderColor: palette.ink },
    filterChipText: { color: palette.inkMuted, fontSize: 12, fontWeight: "700" },
    filterChipTextActive: { color: palette.paper },
    variantBlock: { gap: spacing.md },
    variantHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md },
    variantKicker: { color: palette.inkMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 3 },
    variantTitle: { color: palette.ink, fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
    variantCount: { color: palette.inkMuted, fontSize: 12, paddingBottom: 3 },
    timeline: { gap: spacing.lg },
    timelineGroup: { gap: spacing.sm },
    timelineDateRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    timelineNode: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: palette.primary, backgroundColor: palette.paper },
    timelineDate: { color: palette.inkMuted, fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
    eventCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, overflow: "hidden" },
    eventCardUnread: { borderColor: palette.danger, backgroundColor: palette.dangerWash },
    eventPress: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.danger, marginTop: 5 },
    kindBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 5 },
    kindDot: { width: 6, height: 6, borderRadius: 3 },
    kindText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
    eventCopy: { flex: 1, minWidth: 0, gap: 4 },
    eventTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    eventTitle: { flex: 1, color: palette.ink, fontSize: 15, fontWeight: "800" },
    eventDate: { color: palette.inkMuted, fontSize: 11, fontVariant: ["tabular-nums"] },
    eventSummary: { color: palette.ink, fontSize: 13, lineHeight: 18 },
    eventMeta: { color: palette.inkMuted, fontSize: 11 },
    diffBlock: { borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.ink, padding: spacing.md, gap: spacing.sm },
    diffHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    diffTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    diffTitle: { color: palette.white, fontSize: 11, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
    diffAction: { color: palette.primary, fontSize: 12, fontWeight: "800" },
    diffLines: { gap: 3 },
    diffLine: { color: "#CAD5E4", fontFamily: "Courier", fontSize: 12, lineHeight: 17 },
    diffAdded: { color: "#8BE5B8" },
    diffRemoved: { color: "#FF9AA1" },
    diffContext: { color: "#8FB6F5", fontWeight: "800" },
    affectedBlock: { backgroundColor: palette.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 5 },
    affectedLabel: { color: palette.inkMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    affectedRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    affectedText: { flex: 1, color: palette.ink, fontSize: 12 },
    inboxCount: { alignItems: "flex-end" },
    inboxCountNumber: { color: palette.danger, fontSize: 28, lineHeight: 30, fontWeight: "900" },
    inboxCountLabel: { color: palette.inkMuted, fontSize: 11, fontWeight: "800" },
    sectionLabel: { color: palette.inkMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
    inboxRow: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, overflow: "hidden" },
    inboxRowUnread: { borderColor: palette.danger },
    inboxMainRow: { flexDirection: "row", alignItems: "stretch" },
    inboxPress: { width: 40, alignItems: "center", paddingTop: spacing.md },
    inboxStatus: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
    inboxStatusUnread: { backgroundColor: palette.danger, borderColor: palette.danger },
    inboxStatusRead: { backgroundColor: "transparent", borderColor: palette.lineStrong },
    inboxCopy: { flex: 1, paddingVertical: spacing.md, paddingRight: spacing.sm, gap: 4 },
    inboxTop: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
    inboxCategory: { color: palette.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
    inboxTitle: { color: palette.ink, fontSize: 15, fontWeight: "800" },
    inboxChevron: { ...accessibilityTargetStyle(44), alignItems: "center", justifyContent: "center" },
    inboxExpanded: { borderTopWidth: 1, borderTopColor: palette.line },
    branchDescription: { color: palette.inkMuted, fontSize: 13, lineHeight: 19 },
    branchLayout: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    commitRail: { width: 112 },
    commitNodeRow: { flexDirection: "row", gap: 7, minHeight: 78 },
    commitLine: { width: 18, alignItems: "center" },
    commitNode: { width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: palette.lineStrong, backgroundColor: palette.paper, zIndex: 2 },
    commitNodeActive: { borderColor: palette.primary, backgroundColor: palette.primary },
    commitNodeUnread: { borderColor: palette.danger },
    commitStem: { position: "absolute", top: 13, bottom: -3, width: 2, backgroundColor: palette.line },
    commitLabel: { flex: 1, gap: 2 },
    commitRef: { color: palette.inkMuted, fontSize: 10, fontWeight: "900" },
    commitRefActive: { color: palette.primary },
    commitDate: { color: palette.inkMuted, fontSize: 10 },
    commitTitle: { color: palette.ink, fontSize: 11, fontWeight: "700", lineHeight: 14 },
    selectedCommit: { flex: 1, minWidth: 0, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.primary, borderRadius: radii.md, overflow: "hidden" },
    selectedHeader: { padding: spacing.md, gap: spacing.sm },
    commitMeta: { color: palette.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
    selectedTitle: { color: palette.ink, fontSize: 17, fontWeight: "800", marginTop: 4 },
    selectedSummary: { color: palette.ink, fontSize: 13, lineHeight: 18, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
    detailPreview: { gap: spacing.sm },
    detailTitle: { color: palette.ink, fontSize: 28, fontWeight: "900", letterSpacing: -0.7 },
    detailSubtitle: { color: palette.inkMuted, fontSize: 13 },
    detailTargetRow: { flexDirection: "row", gap: spacing.xs, marginVertical: spacing.sm },
    detailTarget: { minHeight: 36, justifyContent: "center", borderRadius: radii.pill, borderWidth: 1, borderColor: palette.lineStrong, paddingHorizontal: spacing.md },
    detailTargetActive: { backgroundColor: palette.ink, borderColor: palette.ink },
    detailTargetText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800" },
    detailTargetTextActive: { color: palette.paper },
    detailBody: { backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1, borderColor: palette.line, padding: spacing.md, gap: spacing.sm },
    detailBodyHeading: { color: palette.ink, fontSize: 17, fontWeight: "800" },
    detailBodyText: { color: palette.inkMuted, fontSize: 13, lineHeight: 19 },
    detailHistoryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: palette.line, paddingTop: spacing.md, marginTop: spacing.sm },
    detailHistoryTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
    detailHistoryMeta: { color: palette.inkMuted, fontSize: 11, marginTop: 3 },
    emptyDetail: { color: palette.inkMuted, fontSize: 13, paddingVertical: spacing.md },
    prototypeNote: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, backgroundColor: palette.surfaceMuted, borderRadius: radii.md },
    prototypeNoteText: { flex: 1, color: palette.inkMuted, fontSize: 11, lineHeight: 16 },
    switcher: { position: "absolute", left: spacing.xl, right: spacing.xl, bottom: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: palette.ink, borderRadius: radii.pill, padding: 6, ...shadows.floating },
    switcherButton: { ...accessibilityTargetStyle(44), borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
    switcherLabel: { flex: 1, alignItems: "center", gap: 1 },
    switcherVariant: { color: palette.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    switcherName: { color: palette.white, fontSize: 12, fontWeight: "800" },
  });
}
