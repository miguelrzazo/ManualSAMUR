import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NavigationContainer, type NavigatorScreenParams } from "@react-navigation/native";
import { createBottomTabNavigator, type BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing } from "@manual-samur/design-tokens";
import { ContentProvider, findProcedure, useContent } from "./src/content";
import { PreferencesProvider, usePreferences, type AppearancePreference } from "./src/preferences";
import type { MobileProcedure } from "./src/data/schema";
import { procedureHeadings, procedureRouteKey, readingPositions, searchProcedures, splitProcedureSections, type ProcedureSection } from "./src/procedure-logic";
import { searchAbbreviations, searchCodes, searchVademecum, type MobileReferenceSearchResult } from "./src/reference-search-logic";

type TabsParamList = {
  Inicio: undefined;
  Buscar: undefined;
  Guardados: undefined;
  Mapa: undefined;
};

type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList> | undefined;
  Procedure: { id: string };
  Drug: { id: string };
  Codes: { query?: string } | undefined;
  Abbreviations: { query?: string } | undefined;
};

const Tabs = createBottomTabNavigator<TabsParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function LogoMark({ small = false }: { small?: boolean }) {
  return (
    <View style={[styles.logoMark, small && styles.logoMarkSmall]} accessible accessibilityLabel="Pulso abierto">
      <View style={[styles.logoCrossVertical, small && styles.logoSmallBar]} />
      <View style={[styles.logoCrossHorizontal, small && styles.logoSmallHorizontal]} />
      <View style={[styles.logoArrow, small && styles.logoArrowSmall]} />
    </View>
  );
}

function BrandHeader({ onSettings }: { onSettings?: () => void }) {
  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandLockup}>
        <LogoMark small />
        <View>
          <Text style={styles.brandName}>Pulso abierto</Text>
          <Text style={styles.brandSubline}>MANUALSAMUR · REFERENCIA</Text>
        </View>
      </View>
      {onSettings && (
        <Pressable onPress={onSettings} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Ajustes">
          <MaterialCommunityIcons name="tune-variant" size={21} color={colors.ink} />
        </Pressable>
      )}
    </View>
  );
}

function SearchBar({ value, onChangeText, onPress }: { value?: string; onChangeText?: (value: string) => void; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.searchBar} accessibilityRole={onChangeText ? "none" : "button"} accessibilityLabel="Buscar en el manual">
      <MaterialCommunityIcons name="magnify" size={22} color={colors.inkMuted} />
      {onChangeText ? <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Buscar procedimientos, fármacos o códigos"
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Buscar procedimientos, fármacos o códigos"
        /> : <Text style={styles.searchPlaceholder}>Buscar procedimientos, fármacos o códigos</Text>}
      <View style={styles.offlineDot} />
    </Pressable>
  );
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeading}>
      <View>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action && <Pressable onPress={onAction} accessibilityRole="button"><Text style={styles.sectionAction}>{action}</Text></Pressable>}
    </View>
  );
}

function ActionCard({ icon, label, detail, tone = "red", onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; detail: string; tone?: "red" | "navy" | "amber" | "green"; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${label}. ${detail}`}>
      <View style={[styles.actionIcon, tone === "navy" && styles.actionIconNavy, tone === "amber" && styles.actionIconAmber, tone === "green" && styles.actionIconGreen]}>
        <MaterialCommunityIcons name={icon} size={22} color={tone === "red" ? colors.red : tone === "navy" ? colors.ink : tone === "amber" ? colors.amber : colors.green} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionDetail}>{detail}</Text>
    </Pressable>
  );
}

function ProcedureRow({ procedure, onPress, showFavorite = false }: { procedure: MobileProcedure; onPress: () => void; showFavorite?: boolean }) {
  const { favorites, toggleFavorite } = useContent();
  const favorite = favorites.includes(procedure.id);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRow, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${procedure.id}, ${procedure.title}`}>
      <View style={styles.resourceCode}><Text style={styles.resourceCodeText}>{procedure.id}</Text></View>
      <View style={styles.resourceCopy}>
        <Text style={styles.resourceTitle} numberOfLines={2}>{procedure.title}</Text>
        <Text style={styles.resourceMeta}>{procedure.section} · {procedure.attachments.length ? `${procedure.attachments.length} anexos` : "consulta offline"}</Text>
      </View>
      {showFavorite && <Pressable onPress={() => toggleFavorite(procedure.id)} hitSlop={12} accessibilityRole="button" accessibilityLabel={favorite ? "Quitar de guardados" : "Guardar procedimiento"}>
        <MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={22} color={favorite ? colors.amber : colors.inkMuted} />
      </Pressable>}
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkMuted} />
    </Pressable>
  );
}

function HomeScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Inicio">) {
  const { content, recents, snapshot, isRefreshing, lastError, refresh } = useContent();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const recentProcedures = recents.map((id) => findProcedure(content, id)).filter((item): item is MobileProcedure => Boolean(item)).slice(0, 3);
  const manualVersion = typeof content.manual.manualVersionCurrent === "string" ? content.manual.manualVersionCurrent : "paquete local";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <BrandHeader onSettings={() => setSettingsOpen(true)} />
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>TODO A MANO · SIN COBERTURA</Text>
            <Text style={styles.heroTitle}>La referencia que{`\n`}te acompaña.</Text>
            <Text style={styles.heroBody}>Procedimientos, medicación y comunicaciones listos para consulta en guardia.</Text>
          </View>
          <LogoMark />
        </View>
        <SearchBar onPress={() => navigation.navigate("Buscar")} />

        <SectionHeading eyebrow="ACCESOS RÁPIDOS" title="Consulta por recurso" />
        <View style={styles.actionGrid}>
          <ActionCard icon="clipboard-text-outline" label="Procedimientos" detail={`${content.procedures.length} fichas`} onPress={() => navigation.navigate("Buscar")} />
          <ActionCard icon="pill" label="Vademécum" detail={`${content.drugs.length} fármacos`} tone="navy" onPress={() => navigation.navigate("Buscar")} />
          <ActionCard icon="radio-handheld" label="Códigos" detail="Radio y claves" tone="amber" onPress={() => navigation.getParent()?.navigate("Codes")} />
          <ActionCard icon="format-letter-case" label="Abreviaturas" detail="Consulta rápida" tone="green" onPress={() => navigation.getParent()?.navigate("Abbreviations")} />
        </View>

        {recentProcedures.length > 0 && <>
          <SectionHeading eyebrow="SESIÓN ACTUAL" title="Continuar consulta" action="Ver todo" onAction={() => navigation.navigate("Guardados")} />
          <View style={styles.cardList}>
            {recentProcedures.map((procedure) => <ProcedureRow key={procedure.id} procedure={procedure} onPress={() => navigation.getParent()?.navigate("Procedure", { id: procedure.id })} />)}
          </View>
        </>}

        <View style={styles.syncCard}>
          <View style={styles.syncIcon}><MaterialCommunityIcons name="cloud-check-outline" size={20} color={colors.green} /></View>
          <View style={styles.syncCopy}>
            <Text style={styles.syncTitle}>Contenido disponible offline</Text>
            <Text style={styles.syncDetail}>{manualVersion} · hash verificado</Text>
          </View>
          <Pressable onPress={() => void refresh()} disabled={isRefreshing} accessibilityRole="button" accessibilityLabel="Actualizar contenido">
            <Text style={styles.syncAction}>{isRefreshing ? "…" : "Actualizar"}</Text>
          </Pressable>
        </View>
        <Text style={styles.disclaimer}>Pulso abierto es una adaptación independiente y no oficial. Consulta siempre la fuente operativa vigente.</Text>
      </ScrollView>
      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} onRefresh={refresh} generatedAt={snapshot.generatedAt} isRefreshing={isRefreshing} lastError={lastError} />
    </SafeAreaView>
  );
}

function SearchScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Buscar">) {
  const { content } = useContent();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"Todo" | "Procedimientos" | "Vademécum" | "Códigos" | "Abreviaturas">("Todo");
  const procedureResults = useMemo(() => searchProcedures(content.procedures, query), [content.procedures, query]);
  const vademecumResults = useMemo(() => searchVademecum(content, query), [content, query]);
  const codeResults = useMemo(() => searchCodes(content.codes, query), [content.codes, query]);
  const abbreviationResults = useMemo(() => searchAbbreviations(content.abbreviations, query), [content.abbreviations, query]);
  const visibleProcedures = filter === "Vademécum" || filter === "Códigos" || filter === "Abreviaturas" ? [] : procedureResults.map(({ procedure }) => procedure);
  const visibleVademecum = filter === "Procedimientos" || filter === "Códigos" || filter === "Abreviaturas" ? [] : vademecumResults;
  const visibleCodes = filter === "Procedimientos" || filter === "Vademécum" || filter === "Abreviaturas" ? [] : codeResults;
  const visibleAbbreviations = filter === "Procedimientos" || filter === "Vademécum" || filter === "Códigos" ? [] : abbreviationResults;
  const rows = [
    ...visibleProcedures.map((item) => ({ kind: "procedure" as const, item })),
    ...visibleVademecum.map((item) => ({ kind: "reference" as const, item })),
    ...visibleCodes.map((item) => ({ kind: "reference" as const, item })),
    ...visibleAbbreviations.map((item) => ({ kind: "reference" as const, item })),
  ];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.searchScreenHeader}><Text style={styles.pageTitle}>Buscar</Text><Text style={styles.pageKicker}>CONSULTA LOCAL</Text></View>
      <View style={styles.searchPadding}><SearchBar value={query} onChangeText={setQuery} /></View>
      <View style={styles.filterRow} accessibilityRole="tablist">
        {(["Todo", "Procedimientos", "Vademécum", "Códigos", "Abreviaturas"] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filterChip, filter === item && styles.filterChipActive]} accessibilityRole="tab" accessibilityState={{ selected: filter === item }}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>)}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item, index) => `${item.kind}-${item.item.id}-${index}`}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<EmptyState title={query.trim() ? "Sin coincidencias" : "Procedimientos no disponibles"} detail={query.trim() ? "Prueba con un código, un nombre, un sinónimo o una palabra del contenido." : "El paquete local no contiene procedimientos utilizables. Revisa una actualización cuando tengas conexión."} />}
        renderItem={({ item }) => item.kind === "procedure" ? <ProcedureRow procedure={item.item} showFavorite onPress={() => navigation.getParent()?.navigate("Procedure", { id: item.item.id })} /> : <ReferenceRow reference={item.item} onCodes={() => navigation.getParent()?.navigate("Codes", { query: query.trim() || undefined })} onAbbreviations={() => navigation.getParent()?.navigate("Abbreviations", { query: query.trim() || undefined })} onDrug={(id) => navigation.getParent()?.navigate("Drug", { id })} />}
      />
    </SafeAreaView>
  );
}

function ReferenceRow({ reference, onCodes, onAbbreviations, onDrug }: { reference: MobileReferenceSearchResult; onCodes: () => void; onAbbreviations: () => void; onDrug: (id: string) => void }) {
  const icon = reference.kind === "code" ? "radio-handheld" : reference.kind === "abbreviation" ? "format-letter-case" : "pill";
  const onPress = reference.kind === "code" ? onCodes : reference.kind === "abbreviation" ? onAbbreviations : () => reference.targetId && onDrug(reference.targetId);
  return <Pressable onPress={onPress} disabled={reference.kind !== "code" && reference.kind !== "abbreviation" && !reference.targetId} style={({ pressed }) => [styles.resourceRow, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${reference.title}. ${reference.subtitle}`}>
    <View style={[styles.resourceCode, reference.kind === "code" ? styles.codeResultCode : reference.kind === "abbreviation" ? styles.abbreviationResultCode : styles.drugCode]}><MaterialCommunityIcons name={icon} size={17} color={colors.ink} /></View>
    <View style={styles.resourceCopy}><Text style={styles.resourceTitle} numberOfLines={2}>{reference.title}</Text><Text style={styles.resourceMeta}>{reference.badge ? `${reference.badge} · ` : ""}{reference.subtitle}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkMuted} />
  </Pressable>;
}

function DrugRow({ drug, onPress }: { drug: Record<string, unknown>; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.resourceRow, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Fármaco ${String(drug.name ?? "sin nombre")}`}>
    <View style={[styles.resourceCode, styles.drugCode]}><MaterialCommunityIcons name="pill" size={17} color={colors.ink} /></View>
    <View style={styles.resourceCopy}><Text style={styles.resourceTitle} numberOfLines={2}>{String(drug.name ?? "Fármaco")}</Text><Text style={styles.resourceMeta}>{String(drug.category ?? "Vademécum")} · {String(drug.presentation ?? "")}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkMuted} />
  </Pressable>;
}

function SavedScreen({ navigation }: BottomTabScreenProps<TabsParamList, "Guardados">) {
  const { content, favorites, recents } = useContent();
  const saved = favorites.map((id) => findProcedure(content, id)).filter((item): item is MobileProcedure => Boolean(item));
  const recent = recents.map((id) => findProcedure(content, id)).filter((item): item is MobileProcedure => Boolean(item));
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scrollContent}>
    <View style={styles.searchScreenHeader}><Text style={styles.pageTitle}>Guardados</Text><Text style={styles.pageKicker}>TU TURNO</Text></View>
    <SectionHeading eyebrow="ACCESO DIRECTO" title="Favoritos" />
    {saved.length ? <View style={styles.cardList}>{saved.map((item) => <ProcedureRow key={item.id} procedure={item} showFavorite onPress={() => navigation.getParent()?.navigate("Procedure", { id: item.id })} />)}</View> : <EmptyState title="Aún no hay favoritos" detail="Guarda una ficha con la estrella para encontrarla aquí." />}
    <SectionHeading eyebrow="HISTORIAL LOCAL" title="Recientes" />
    {recent.length ? <View style={styles.cardList}>{recent.map((item) => <ProcedureRow key={item.id} procedure={item} onPress={() => navigation.getParent()?.navigate("Procedure", { id: item.id })} />)}</View> : <EmptyState title="Sin historial" detail="Las fichas que consultes aparecerán aquí durante tu sesión." />}
  </ScrollView></SafeAreaView>;
}

function MapScreen() {
  const { content } = useContent();
  const [selected, setSelected] = useState<Record<string, unknown>>();
  const locations: Array<Record<string, unknown> & { kind: "Base" | "Hospital" }> = [
    ...content.bases.map((item) => ({ ...item, kind: "Base" as const })),
    ...content.hospitals.map((item) => ({ ...item, kind: "Hospital" as const })),
  ];
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.scrollContent}>
    <View style={styles.searchScreenHeader}><Text style={styles.pageTitle}>Mapa</Text><Text style={styles.pageKicker}>MADRID · OFFLINE</Text></View>
    <View style={styles.mapLegend}><View style={styles.mapLegendDot} /><Text style={styles.mapLegendText}>Directorio local de bases y hospitales</Text></View>
    <View style={styles.schematicMap} accessible accessibilityLabel="Mapa esquemático offline de Madrid">
      <View style={styles.mapRoadOne} /><View style={styles.mapRoadTwo} /><View style={styles.mapRoadThree} />
      {locations.slice(0, 18).map((item, index) => <Pressable key={`${String(item.id)}-${index}`} onPress={() => setSelected(item)} style={[styles.mapPin, index % 3 === 0 ? styles.mapPinRed : styles.mapPinNavy, { left: `${12 + ((index * 31) % 76)}%`, top: `${15 + ((index * 47) % 65)}%` }]} accessibilityRole="button" accessibilityLabel={`${item.kind} ${String(item.name ?? item.shortName ?? item.id)}`}><MaterialCommunityIcons name={item.kind === "Base" ? "ambulance" : "hospital-building"} size={13} color={colors.white} /></Pressable>)}
      <View style={styles.mapCompass}><Text style={styles.mapCompassN}>N</Text><MaterialCommunityIcons name="navigation" size={18} color={colors.red} /></View>
    </View>
    <SectionHeading eyebrow={`${locations.length} PUNTOS LOCALES`} title="Bases y hospitales" />
    <View style={styles.cardList}>{locations.map((item, index) => <Pressable key={`${String(item.id)}-${index}`} onPress={() => setSelected(item)} style={styles.locationRow} accessibilityRole="button"><View style={[styles.locationIcon, item.kind === "Base" && styles.locationIconBase]}><MaterialCommunityIcons name={item.kind === "Base" ? "ambulance" : "hospital-building"} size={18} color={colors.ink} /></View><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{String(item.shortName ?? item.name ?? item.id)}</Text><Text style={styles.resourceMeta}>{item.kind} · {String(item.district ?? item.address ?? "Madrid")}</Text></View><MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkMuted} /></Pressable>)}</View>
    <Text style={styles.mapNote}>La cartografía/routing offline completo sigue pendiente de decisión de proveedor y empaquetado de tiles.</Text>
    <LocationModal location={selected} onClose={() => setSelected(undefined)} />
  </ScrollView></SafeAreaView>;
}

function ProcedureScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Procedure">) {
  const { content, favorites, toggleFavorite, remember } = useContent();
  const [attachmentError, setAttachmentError] = useState<string>();
  const procedure = findProcedure(content, route.params.id);
  const scrollRef = useRef<ScrollView>(null);
  const routeKey = procedure ? procedureRouteKey(procedure) : `procedure:${route.params.id}`;
  const sections = useMemo(() => procedure ? splitProcedureSections(procedure.content) : [], [procedure]);
  const headings = useMemo(() => procedureHeadings(procedure?.content ?? ""), [procedure]);
  const sectionOffsets = useRef<Record<string, number>>({});
  const markdownOrigin = useRef(0);
  useEffect(() => {
    if (procedure) remember(procedure.id);
  }, [procedure, remember]);
  useEffect(() => {
    if (!procedure) return;
    const offset = readingPositions.get(routeKey);
    if (offset > 0) requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: offset, animated: false }));
  }, [procedure, routeKey]);
  if (!procedure) return <MissingResource title="Procedimiento no disponible" detail={`No se encontró “${route.params.id}” en el paquete local.`} onRecover={() => navigation.navigate("Tabs", { screen: "Buscar" })} />;
  const favorite = favorites.includes(procedure.id);
  const relatedIds = [...new Set([
    ...procedure.related,
    ...procedure.backlinks,
    ...procedure.relations.map((relation) => relation.id),
  ])].filter((id) => id !== procedure.id);
  const related = relatedIds.map((id) => findProcedure(content, id)).filter((item): item is MobileProcedure => Boolean(item));
  const unresolvedRelatedIds = relatedIds.filter((id) => !findProcedure(content, id));
  const openAttachment = async (sourceUrl: string, filename: string) => {
    try {
      if (!(await Linking.canOpenURL(sourceUrl))) throw new Error("URL no disponible");
      await Linking.openURL(sourceUrl);
    } catch {
      setAttachmentError(`No se pudo abrir ${filename}. El archivo local no está disponible; prueba de nuevo con conexión.`);
    }
  };
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView
    ref={scrollRef}
    contentContainerStyle={styles.detailContent}
    onScroll={(event) => readingPositions.set(routeKey, event.nativeEvent.contentOffset.y)}
    scrollEventThrottle={100}
  >
    <View style={styles.detailTopbar}><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.detailTopbarLabel}>PROCEDIMIENTO {procedure.id}</Text><Pressable onPress={() => toggleFavorite(procedure.id)} accessibilityRole="button" accessibilityLabel={favorite ? "Quitar de favoritos" : "Guardar en favoritos"}><MaterialCommunityIcons name={favorite ? "star" : "star-outline"} size={25} color={favorite ? colors.amber : colors.ink} /></Pressable></View>
    <Text style={styles.detailSection}>{procedure.section.toUpperCase()}</Text><Text style={styles.detailTitle}>{procedure.title}</Text><Text style={styles.detailMeta}>Actualizado {procedure.updated || "sin fecha"} · {procedure.attachments.length} anexos</Text>
    <View style={styles.sourceNotice}><MaterialCommunityIcons name="information-outline" size={19} color={colors.red} /><Text style={styles.sourceNoticeText}>Consulta de referencia. Confirma siempre la versión operativa vigente.</Text></View>
    {headings.length > 0 && <View style={styles.contentsCard} accessibilityLabel="Contenido del procedimiento"><Text style={styles.contentsTitle}>CONTENIDO</Text>{headings.map((heading) => <Pressable key={heading.id} onPress={() => { const offset = sectionOffsets.current[heading.id]; if (typeof offset === "number") scrollRef.current?.scrollTo({ y: Math.max(0, offset - spacing.md), animated: true }); }} style={styles.contentsRow} accessibilityRole="button" accessibilityLabel={`Ir a ${heading.text}`}><Text style={[styles.contentsText, heading.level > 2 && styles.contentsTextNested]}>{heading.text}</Text><MaterialCommunityIcons name="chevron-down" size={16} color={colors.inkMuted} /></Pressable>)}</View>}
    <MarkdownContent sections={sections} onContainerLayout={(offset) => { markdownOrigin.current = offset; }} onSectionLayout={(id, offset) => { sectionOffsets.current[id] = markdownOrigin.current + offset; }} />
    <ProcedureEditorialBlocks blocks={procedure.editorialBlocks} onProcedure={(id) => navigation.push("Procedure", { id })} />
    {related.length > 0 && <><SectionHeading eyebrow="CONTEXTO DEL MANUAL" title="Referencias relacionadas" /><View style={styles.cardList}>{related.map((item) => <ProcedureRow key={`related-${item.id}`} procedure={item} onPress={() => navigation.push("Procedure", { id: item.id })} />)}</View></>}
    {unresolvedRelatedIds.length > 0 && <View style={styles.sourceNotice}><MaterialCommunityIcons name="link-variant-off" size={19} color={colors.red} /><Text style={styles.sourceNoticeText}>Algunas referencias ({unresolvedRelatedIds.join(", ")}) no están incluidas en este paquete local.</Text></View>}
    {procedure.updates.length > 0 && <><SectionHeading eyebrow="HISTORIAL EDITORIAL" title="Actualizaciones" /><View style={styles.updateList}>{procedure.updates.map((update, index) => <ProcedureUpdate key={index} update={update} />)}</View></>}
    {procedure.attachments.length > 0 && <><SectionHeading eyebrow="MATERIAL OFICIAL" title="Anexos" />{attachmentError && <View style={styles.sourceNotice}><MaterialCommunityIcons name="alert-circle-outline" size={19} color={colors.red} /><Text style={styles.sourceNoticeText}>{attachmentError}</Text></View>}<View style={styles.cardList}>{procedure.attachments.map((attachment) => <Pressable key={attachment.id} onPress={() => void openAttachment(attachment.sourceUrl, attachment.filename)} style={styles.attachmentRow} accessibilityRole="button" accessibilityLabel={`Abrir anexo ${attachment.filename}. Requiere conexión para abrir la fuente externa`}><MaterialCommunityIcons name={attachment.kind === "pdf" ? "file-pdf-box" : "image-outline"} size={23} color={colors.red} /><View style={styles.resourceCopy}><Text style={styles.resourceTitle} numberOfLines={2}>{attachment.filename}</Text><Text style={styles.resourceMeta}>{attachment.kind.toUpperCase()} · requiere conexión para abrir fuente externa</Text></View><MaterialCommunityIcons name="open-in-new" size={18} color={colors.inkMuted} /></Pressable>)}</View></>}
  </ScrollView></SafeAreaView>;
}

function DrugScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Drug">) {
  const { content } = useContent();
  const drug = content.drugs.find((item) => String(item.id) === route.params.id);
  if (!drug) return <MissingResource title="Fármaco no disponible" />;
  const fields = [["Función", "funcion"], ["Indicación", "indication"], ["Dosis", "dose"], ["Presentación", "presentation"]] as const;
  return <SafeAreaView style={styles.screen} edges={["top"]}><ScrollView contentContainerStyle={styles.detailContent}><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.detailSection}>VADEMÉCUM</Text><Text style={styles.detailTitle}>{String(drug.name ?? "Fármaco")}</Text><Text style={styles.detailMeta}>{String(drug.category ?? "")} · {String(drug.subcategory ?? "")}</Text>{fields.map(([label, key]) => typeof drug[key] === "string" && drug[key] ? <View key={key} style={styles.infoBlock}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{String(drug[key])}</Text></View> : null)}</ScrollView></SafeAreaView>;
}

function CodesScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Codes">) {
  const { content } = useContent();
  const [query, setQuery] = useState(route.params?.query ?? "");
  const codes = useMemo(() => searchCodes(content.codes, query, 2000), [content.codes, query]);
  return <SafeAreaView style={styles.screen} edges={["top"]}><FlatList data={codes} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} ListHeaderComponent={<><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.pageTitle}>Códigos y claves</Text><Text style={styles.pageKicker}>RADIO · CONSULTA LOCAL</Text><View style={styles.detailSearch}><SearchBar value={query} onChangeText={setQuery} /></View></>} ListEmptyComponent={<EmptyState title="Sin coincidencias" detail="Prueba con el código, nombre, categoría o descripción." />} renderItem={({ item }) => <View style={styles.codeRow}><Text style={styles.codeValue}>{item.badge ?? "—"}</Text><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{item.title}</Text><Text style={styles.resourceMeta}>{item.subtitle}</Text></View></View>} /></SafeAreaView>;
}

function AbbreviationsScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "Abbreviations">) {
  const { content } = useContent();
  const [query, setQuery] = useState(route.params?.query ?? "");
  const entries = useMemo(() => searchAbbreviations(content.abbreviations, query, 1000), [content.abbreviations, query]);
  return <SafeAreaView style={styles.screen} edges={["top"]}><FlatList data={entries} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} ListHeaderComponent={<><Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><MaterialCommunityIcons name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.pageTitle}>Abreviaturas</Text><Text style={styles.pageKicker}>LENGUAJE OPERATIVO</Text><View style={styles.detailSearch}><SearchBar value={query} onChangeText={setQuery} /></View></>} ListEmptyComponent={<EmptyState title="Sin coincidencias" detail="Prueba con la abreviatura o su significado." />} renderItem={({ item }) => <View style={styles.abbreviationRow}><Text style={styles.abbreviation}>{item.title}</Text><View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{item.subtitle}</Text><Text style={styles.resourceMeta}>Letra {item.badge ?? "—"}</Text></View></View>} /></SafeAreaView>;
}

function readableMarkdownLine(line: string): string {
  return line
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/^\s*[*_~`]+|[*_~`]+\s*$/g, "")
    .replace(/<DrugLink\s+name="([^"]+)"\s*\/>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/>>\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function MarkdownContent({ sections, onContainerLayout, onSectionLayout }: { sections: ProcedureSection[]; onContainerLayout: (offset: number) => void; onSectionLayout: (id: string, offset: number) => void }) {
  return <View style={styles.markdown} onLayout={(event) => onContainerLayout(event.nativeEvent.layout.y)}>{sections.map((section) => <View key={section.key} onLayout={(event) => onSectionLayout(section.key, event.nativeEvent.layout.y)}>{section.heading && <Text style={section.heading.level === 2 ? styles.markdownH2 : styles.markdownH3}>{section.heading.text}</Text>}{section.lines.map((line, index) => { const trimmed = line.trim(); if (!trimmed || trimmed.startsWith("🖨️") || /^#{2,6}\s/.test(trimmed)) return null; const text = readableMarkdownLine(trimmed); if (!text) return null; if (/^(\*|-|•)\s/.test(trimmed)) return <View key={`${section.key}-${index}`} style={styles.markdownBullet}><Text style={styles.bulletDot}>•</Text><Text style={styles.markdownText}>{text}</Text></View>; return <Text key={`${section.key}-${index}`} style={styles.markdownText}>{text}</Text>; })}</View>)}</View>;
}

function ProcedureEditorialBlocks({ blocks, onProcedure }: { blocks: unknown[]; onProcedure?: (id: string) => void }) {
  const usable = blocks.filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === "object");
  if (!usable.length) return null;
  return <><SectionHeading eyebrow="NOTAS EDITORIALES" title="Puntos destacados" /><View style={styles.editorialList}>{usable.map((block, index) => { const items = Array.isArray(block.items) ? block.items : []; const assets = Array.isArray(block.assets) ? block.assets : []; return <View key={String(block.id ?? index)} style={styles.editorialBlock}><Text style={styles.infoLabel}>{String(block.label ?? block.type ?? "Nota")}</Text>{typeof block.title === "string" && <Text style={styles.editorialTitle}>{block.title}</Text>}{typeof block.content === "string" && <Text style={styles.infoValue}>{block.content}</Text>}{items.map((item, itemIndex) => { const itemId = typeof item === "string" && /^\d/.test(item) ? item : undefined; const itemText = typeof item === "string" ? item : String((item as Record<string, unknown>)?.label ?? (item as Record<string, unknown>)?.title ?? "Referencia"); return itemId && onProcedure ? <Pressable key={itemIndex} onPress={() => onProcedure(itemId)} style={styles.editorialLink} accessibilityRole="button" accessibilityLabel={`Abrir procedimiento ${itemId}`}><Text style={styles.markdownText}>• {itemText}</Text><MaterialCommunityIcons name="chevron-right" size={17} color={colors.inkMuted} /></Pressable> : <Text key={itemIndex} style={styles.markdownText}>• {itemText}</Text>; })}{assets.map((asset, assetIndex) => <Text key={assetIndex} style={styles.resourceMeta}>{String((asset as Record<string, unknown>)?.title ?? (asset as Record<string, unknown>)?.src ?? "Material editorial")}</Text>)}</View>; })}</View></>;
}

function ProcedureUpdate({ update }: { update: unknown }) {
  const value = update && typeof update === "object" ? update as Record<string, unknown> : {};
  const date = String(value.date ?? value.updatedAt ?? value.createdAt ?? "Fecha no indicada");
  const label = String(value.title ?? value.label ?? value.type ?? "Actualización del contenido");
  const detail = String(value.summary ?? value.description ?? value.message ?? "");
  return <View style={styles.updateRow}><Text style={styles.infoLabel}>{date.slice(0, 10)}</Text><Text style={styles.resourceTitle}>{label}</Text>{detail && <Text style={styles.resourceMeta}>{detail}</Text>}</View>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) { return <View style={styles.emptyState}><MaterialCommunityIcons name="bookmark-off-outline" size={28} color={colors.inkMuted} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text></View>; }
function MissingResource({ title, detail, onRecover }: { title: string; detail?: string; onRecover?: () => void }) { return <SafeAreaView style={styles.screen}><View style={styles.emptyState}><MaterialCommunityIcons name="file-alert-outline" size={30} color={colors.red} /><Text style={styles.emptyTitle}>{title}</Text>{detail && <Text style={styles.emptyDetail}>{detail}</Text>}{onRecover && <Pressable onPress={onRecover} style={styles.primaryButton} accessibilityRole="button"><Text style={styles.primaryButtonText}>Buscar otro procedimiento</Text></Pressable>}</View></SafeAreaView>; }

function SettingsModal({ visible, onClose, onRefresh, generatedAt, isRefreshing, lastError }: { visible: boolean; onClose: () => void; onRefresh: () => Promise<void>; generatedAt: string; isRefreshing: boolean; lastError?: string }) {
  const { appearance, setAppearance } = usePreferences();
  const appearanceLabels: Record<AppearancePreference, string> = { system: "Sistema", light: "Claro", dark: "Oscuro" };
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
    <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
        <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Información y ajustes</Text><Text style={styles.modalKicker}>PULSO ABIERTO</Text></View><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar"><Text style={styles.modalClose}>Cerrar</Text></Pressable></View>
        <Text style={styles.settingsSectionTitle}>Contenido y sincronización</Text>
        <View style={styles.settingsCard} accessibilityLabel="Estado del contenido local">
          <MaterialCommunityIcons name={isRefreshing ? "cloud-sync-outline" : lastError ? "cloud-alert-outline" : "database-check-outline"} size={25} color={lastError ? colors.red : colors.green} />
          <View style={styles.resourceCopy}><Text style={styles.resourceTitle}>{lastError ? "Contenido local sin actualizar" : "Contenido disponible offline"}</Text><Text style={styles.resourceMeta}>{lastError ?? `Generado ${generatedAt.slice(0, 10)} · hash verificado`}</Text></View>
        </View>
        <Pressable onPress={() => void onRefresh()} disabled={isRefreshing} style={[styles.primaryButton, isRefreshing && styles.disabledButton]} accessibilityRole="button" accessibilityLabel="Buscar actualización"><Text style={styles.primaryButtonText}>{isRefreshing ? "Actualizando…" : "Buscar actualización"}</Text></Pressable>

        <Text style={styles.settingsSectionTitle}>Apariencia</Text>
        <View style={styles.appearanceControl} accessibilityRole="radiogroup" accessibilityLabel="Apariencia de la aplicación">
          {(Object.keys(appearanceLabels) as AppearancePreference[]).map((option) => <Pressable key={option} onPress={() => setAppearance(option)} style={[styles.appearanceOption, appearance === option && styles.appearanceOptionActive]} accessibilityRole="radio" accessibilityState={{ selected: appearance === option }}><MaterialCommunityIcons name={option === "system" ? "theme-light-dark" : option === "light" ? "white-balance-sunny" : "weather-night"} size={17} color={appearance === option ? colors.white : colors.inkMuted} /><Text style={[styles.appearanceText, appearance === option && styles.appearanceTextActive]}>{appearanceLabels[option]}</Text></Pressable>)}
        </View>

        <Text style={styles.settingsSectionTitle}>Aviso y alcance</Text>
        <View style={styles.infoPanel}><Text style={styles.infoPanelTitle}>Referencia independiente</Text><Text style={styles.infoPanelText}>Pulso abierto es una adaptación digital no oficial para consulta. No sustituye instrucciones, protocolos ni criterio profesional. Verifica siempre la versión operativa vigente con SAMUR-Protección Civil Madrid.</Text></View>
        <Text style={styles.settingsSectionTitle}>Privacidad y funcionamiento</Text>
        <Text style={styles.disclaimer}>No se solicitan cuentas ni datos de pacientes. Favoritos, recientes y preferencias permanecen en este dispositivo. No hay publicidad, pagos, analítica obligatoria, notificaciones push ni sincronización entre dispositivos.</Text>
        <Pressable onPress={() => void Linking.openURL("https://servpub.madrid.es/manualsamur/bin/view/Main/")} style={styles.linkRow} accessibilityRole="link"><Text style={styles.linkText}>Abrir fuente oficial del manual</Text><MaterialCommunityIcons name="open-in-new" size={17} color={colors.red} /></Pressable>
        <Text style={styles.legalText}>ManualSAMUR y SAMUR-Protección Civil son referencias de sus titulares. Pulso abierto no implica afiliación, aprobación ni representación institucional.</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function LaunchScreen() {
  return <SafeAreaView style={styles.launchScreen}><LogoMark /><Text style={styles.launchTitle}>Pulso abierto</Text><Text style={styles.launchSubtitle}>MANUALSAMUR · REFERENCIA LOCAL</Text></SafeAreaView>;
}

function FirstUseDisclosure({ onContinue }: { onContinue: () => Promise<void> }) {
  const [isSaving, setIsSaving] = useState(false);
  const continueToApp = async () => { setIsSaving(true); await onContinue(); };
  return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={() => undefined}><SafeAreaView style={styles.disclosureScreen}>
    <View style={styles.disclosureContent}><LogoMark /><Text style={styles.disclosureEyebrow}>ANTES DE EMPEZAR</Text><Text style={styles.disclosureTitle}>Una referencia abierta para la guardia.</Text><Text style={styles.disclosureBody}>Pulso abierto es una adaptación digital independiente y no oficial del ManualSAMUR. El contenido es de referencia: no sustituye protocolos, instrucciones ni criterio profesional.</Text><Text style={styles.disclosureBody}>El manual se consulta offline. No necesitas cuenta y no se recogen datos de pacientes.</Text></View>
    <View><Pressable onPress={() => void continueToApp()} disabled={isSaving} style={[styles.primaryButton, isSaving && styles.disabledButton]} accessibilityRole="button"><Text style={styles.primaryButtonText}>{isSaving ? "Preparando…" : "Entendido, abrir el manual"}</Text></Pressable><Text style={styles.disclosureFooter}>Puedes revisar este aviso, la fuente y la privacidad desde Información y ajustes.</Text></View>
  </SafeAreaView></Modal>;
}

function LocationModal({ location, onClose }: { location?: Record<string, unknown>; onClose: () => void }) {
  if (!location) return null;
  return <Modal visible animationType="slide" transparent onRequestClose={onClose}><Pressable style={styles.modalBackdrop} onPress={onClose}><Pressable style={styles.locationSheet} onPress={(event) => event.stopPropagation()}><View style={styles.sheetHandle} /><Text style={styles.detailSection}>{String(location.kind).toUpperCase()}</Text><Text style={styles.sheetTitle}>{String(location.shortName ?? location.name ?? location.id)}</Text><Text style={styles.resourceMeta}>{String(location.address ?? "Madrid")} · {String(location.district ?? "")}</Text><Pressable onPress={onClose} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Hecho</Text></Pressable></Pressable></Pressable></Modal>;
}

function TabIcon({ name, color }: { name: keyof typeof MaterialCommunityIcons.glyphMap; color: string }) { return <MaterialCommunityIcons name={name} size={23} color={color} />; }

function MainTabs() {
  return <Tabs.Navigator backBehavior="history" screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.red, tabBarInactiveTintColor: colors.inkMuted, tabBarLabelStyle: styles.tabLabel, tabBarStyle: styles.tabBar, tabBarHideOnKeyboard: true, tabBarAccessibilityLabel: "Navegación principal" }}>
    <Tabs.Screen name="Inicio" component={HomeScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="home-variant-outline" color={color} /> }} />
    <Tabs.Screen name="Buscar" component={SearchScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="magnify" color={color} /> }} />
    <Tabs.Screen name="Guardados" component={SavedScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="star-outline" color={color} /> }} />
    <Tabs.Screen name="Mapa" component={MapScreen} options={{ tabBarIcon: ({ color }) => <TabIcon name="map-outline" color={color} /> }} />
  </Tabs.Navigator>;
}

function AppNavigation() {
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true, fullScreenGestureEnabled: true, contentStyle: { backgroundColor: colors.paper } }}><Stack.Screen name="Tabs" component={MainTabs} /><Stack.Screen name="Procedure" component={ProcedureScreen} options={{ presentation: "card" }} /><Stack.Screen name="Drug" component={DrugScreen} options={{ presentation: "card" }} /><Stack.Screen name="Codes" component={CodesScreen} options={{ presentation: "formSheet", gestureDirection: "vertical" }} /><Stack.Screen name="Abbreviations" component={AbbreviationsScreen} options={{ presentation: "formSheet", gestureDirection: "vertical" }} /></Stack.Navigator></NavigationContainer>;
}

function AppGate() {
  const { isHydrated, hasAcknowledgedFirstUse, acknowledgeFirstUse, appearance } = usePreferences();
  if (!isHydrated) return <LaunchScreen />;
  if (!hasAcknowledgedFirstUse) return <FirstUseDisclosure onContinue={acknowledgeFirstUse} />;
  return <><StatusBar style={appearance === "dark" ? "light" : "dark"} /><ContentProvider><AppNavigation /></ContentProvider></>;
}

export default function App() { return <SafeAreaProvider><PreferencesProvider><AppGate /></PreferencesProvider></SafeAreaProvider>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scrollContent: { padding: spacing.lg, paddingBottom: 40 },
  listContent: { padding: spacing.lg, paddingBottom: 40, gap: 8 },
  detailContent: { padding: spacing.lg, paddingBottom: 48 },
  brandHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xl },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoMark: { width: 94, height: 94, borderRadius: 27, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoMarkSmall: { width: 38, height: 38, borderRadius: 11 },
  logoCrossVertical: { position: "absolute", width: 15, height: 60, backgroundColor: colors.white, borderRadius: 3 },
  logoCrossHorizontal: { position: "absolute", width: 60, height: 15, backgroundColor: colors.white, borderRadius: 3 },
  logoSmallBar: { width: 6, height: 24 }, logoSmallHorizontal: { width: 24, height: 6 },
  logoArrow: { position: "absolute", width: 36, height: 36, backgroundColor: colors.ink, transform: [{ rotate: "45deg" }], left: 20, top: 16, borderRadius: 4 },
  logoArrowSmall: { width: 16, height: 16, left: 8, top: 7, borderRadius: 2 },
  brandName: { color: colors.ink, fontSize: 18, fontWeight: "800", letterSpacing: -0.4 },
  brandSubline: { color: colors.red, fontSize: 9, fontWeight: "800", letterSpacing: 1.3, marginTop: 2 },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  hero: { backgroundColor: colors.ink, borderRadius: radii.lg, padding: spacing.xl, minHeight: 190, flexDirection: "row", overflow: "hidden", marginBottom: spacing.lg },
  heroCopy: { flex: 1, zIndex: 1 },
  heroEyebrow: { color: "#B8C4D7", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: spacing.md },
  heroTitle: { color: colors.white, fontSize: 29, lineHeight: 32, fontWeight: "800", letterSpacing: -1 },
  heroBody: { color: "#D7DEEA", fontSize: 13, lineHeight: 18, marginTop: spacing.md, maxWidth: 225 },
  searchBar: { height: 58, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.xl },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14, paddingVertical: 0 }, searchPlaceholder: { flex: 1, color: colors.inkMuted, fontSize: 14 },
  offlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: spacing.md, marginBottom: spacing.md },
  eyebrow: { color: colors.red, fontSize: 10, letterSpacing: 1.3, fontWeight: "800", marginBottom: 4 },
  sectionTitle: { color: colors.ink, fontSize: 21, lineHeight: 25, fontWeight: "800", letterSpacing: -0.5 },
  sectionAction: { color: colors.red, fontSize: 12, fontWeight: "800", paddingBottom: 2 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  actionCard: { width: "48%", minHeight: 126, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  actionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.redWash, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  actionIconNavy: { backgroundColor: "#E7ECF5" }, actionIconAmber: { backgroundColor: colors.amberWash }, actionIconGreen: { backgroundColor: colors.greenWash },
  actionLabel: { fontSize: 15, fontWeight: "800", color: colors.ink }, actionDetail: { fontSize: 11, color: colors.inkMuted, marginTop: 3 },
  cardList: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, overflow: "hidden", marginBottom: spacing.xl },
  resourceRow: { minHeight: 70, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  resourceCode: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.redWash, alignItems: "center", justifyContent: "center" }, resourceCodeText: { fontSize: 11, fontWeight: "900", color: colors.red },
  drugCode: { backgroundColor: "#E7ECF5" }, resourceCopy: { flex: 1 }, resourceTitle: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: "700" }, resourceMeta: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  pressed: { opacity: 0.72 },
  syncCard: { backgroundColor: colors.greenWash, borderRadius: radii.md, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg }, syncIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" }, syncCopy: { flex: 1 }, syncTitle: { color: colors.green, fontWeight: "800", fontSize: 13 }, syncDetail: { color: colors.inkMuted, fontSize: 11, marginTop: 2 }, syncAction: { color: colors.green, fontSize: 12, fontWeight: "800" },
  disclaimer: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginVertical: spacing.md },
  searchScreenHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md }, pageTitle: { color: colors.ink, fontSize: 31, fontWeight: "800", letterSpacing: -1 }, pageKicker: { color: colors.red, fontSize: 10, fontWeight: "800", letterSpacing: 1.3, marginTop: 4 }, searchPadding: { paddingHorizontal: spacing.lg }, detailSearch: { marginTop: spacing.lg },
  filterRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm }, filterChip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted }, filterChipActive: { backgroundColor: colors.ink }, filterText: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" }, filterTextActive: { color: colors.white },
  emptyState: { alignItems: "center", padding: spacing.xl, gap: spacing.sm }, emptyTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 }, emptyDetail: { color: colors.inkMuted, textAlign: "center", fontSize: 13, lineHeight: 18 },
  mapLegend: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }, mapLegendDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green }, mapLegendText: { color: colors.inkMuted, fontSize: 12 },
  schematicMap: { height: 300, borderRadius: radii.lg, backgroundColor: "#E7ECF2", overflow: "hidden", position: "relative", marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.line }, mapRoadOne: { position: "absolute", width: "150%", height: 42, backgroundColor: "#F7F8FA", transform: [{ rotate: "-24deg" }], top: 125, left: -50 }, mapRoadTwo: { position: "absolute", width: "120%", height: 20, backgroundColor: "#F7F8FA", transform: [{ rotate: "38deg" }], top: 64, left: -12 }, mapRoadThree: { position: "absolute", width: 18, height: "130%", backgroundColor: "#F7F8FA", transform: [{ rotate: "15deg" }], top: -20, left: 185 }, mapPin: { position: "absolute", width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.white }, mapPinRed: { backgroundColor: colors.red }, mapPinNavy: { backgroundColor: colors.ink }, mapCompass: { position: "absolute", top: 15, right: 15, alignItems: "center" }, mapCompassN: { fontSize: 11, color: colors.ink, fontWeight: "900" }, mapNote: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: -spacing.md, marginBottom: spacing.xl },
  locationRow: { minHeight: 66, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line }, locationIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.redWash, alignItems: "center", justifyContent: "center" }, locationIconBase: { backgroundColor: colors.amberWash },
  detailTopbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xl }, detailTopbarLabel: { flex: 1, marginHorizontal: spacing.md, textAlign: "center", color: colors.inkMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, detailSection: { color: colors.red, fontSize: 11, fontWeight: "900", letterSpacing: 1.4, marginBottom: spacing.sm }, detailTitle: { color: colors.ink, fontSize: 30, lineHeight: 34, fontWeight: "800", letterSpacing: -0.8 }, detailMeta: { color: colors.inkMuted, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.lg }, sourceNotice: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.redWash, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl }, sourceNoticeText: { flex: 1, color: colors.redDark, fontSize: 12, lineHeight: 17 }, contentsCard: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl }, contentsTitle: { color: colors.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: spacing.sm }, contentsRow: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.line }, contentsText: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "700" }, contentsTextNested: { paddingLeft: spacing.md, fontWeight: "600", color: colors.inkMuted }, markdown: { gap: spacing.sm, marginBottom: spacing.xl }, markdownText: { color: colors.ink, fontSize: 15, lineHeight: 23 }, markdownH2: { color: colors.ink, fontSize: 22, lineHeight: 27, fontWeight: "800", marginTop: spacing.lg }, markdownH3: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: "800", marginTop: spacing.md }, markdownBullet: { flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.sm }, bulletDot: { color: colors.red, fontSize: 18, lineHeight: 23 }, attachmentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, minHeight: 66, borderBottomWidth: 1, borderBottomColor: colors.line }, editorialList: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, overflow: "hidden", marginBottom: spacing.xl }, editorialBlock: { padding: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line }, editorialLink: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, editorialTitle: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: "800" }, updateList: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, overflow: "hidden", marginBottom: spacing.xl }, updateRow: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  infoBlock: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.md }, infoLabel: { color: colors.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 5 }, infoValue: { color: colors.ink, fontSize: 15, lineHeight: 22 }, codeRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line }, codeValue: { minWidth: 55, color: colors.red, fontSize: 15, fontWeight: "900" }, codeResultCode: { backgroundColor: colors.amberWash }, abbreviationResultCode: { backgroundColor: colors.greenWash }, abbreviationRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line }, abbreviation: { width: 70, color: colors.red, fontWeight: "900", fontSize: 13 },
  modal: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg }, modalContent: { paddingBottom: spacing.xxl }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xl }, modalTitle: { color: colors.ink, fontSize: 24, fontWeight: "800" }, modalKicker: { color: colors.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 4 }, modalClose: { color: colors.red, fontWeight: "800", padding: spacing.sm }, settingsSectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.sm }, settingsCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.sm }, primaryButton: { backgroundColor: colors.red, borderRadius: radii.md, padding: spacing.lg, alignItems: "center", marginTop: spacing.md }, disabledButton: { opacity: 0.55 }, primaryButtonText: { color: colors.white, fontWeight: "800", fontSize: 14 }, appearanceControl: { flexDirection: "row", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, padding: 4, gap: 4 }, appearanceOption: { flex: 1, minHeight: 45, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", gap: 3 }, appearanceOptionActive: { backgroundColor: colors.ink }, appearanceText: { color: colors.inkMuted, fontSize: 11, fontWeight: "800" }, appearanceTextActive: { color: colors.white }, infoPanel: { backgroundColor: colors.redWash, padding: spacing.lg, borderRadius: radii.md }, infoPanelTitle: { color: colors.redDark, fontWeight: "900", fontSize: 14, marginBottom: spacing.sm }, infoPanelText: { color: colors.redDark, fontSize: 13, lineHeight: 19 }, linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line }, linkText: { color: colors.red, fontSize: 13, fontWeight: "800" }, legalText: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: spacing.lg }, modalBackdrop: { flex: 1, backgroundColor: "rgba(19,35,61,0.35)", justifyContent: "flex-end" }, locationSheet: { backgroundColor: colors.paper, padding: spacing.xl, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg }, sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: "center", marginBottom: spacing.xl }, sheetTitle: { color: colors.ink, fontSize: 24, lineHeight: 28, fontWeight: "800", marginBottom: spacing.sm },
  launchScreen: { flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }, launchTitle: { color: colors.white, fontSize: 30, fontWeight: "900", letterSpacing: -0.8, marginTop: spacing.lg }, launchSubtitle: { color: "#B8C4D7", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: spacing.sm }, disclosureScreen: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg, justifyContent: "space-between" }, disclosureContent: { alignItems: "flex-start", paddingTop: spacing.xxl }, disclosureEyebrow: { color: colors.red, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginTop: spacing.xxl, marginBottom: spacing.md }, disclosureTitle: { color: colors.ink, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8, marginBottom: spacing.lg }, disclosureBody: { color: colors.ink, fontSize: 16, lineHeight: 23, marginBottom: spacing.md }, disclosureFooter: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: spacing.md, marginBottom: spacing.sm },
  tabBar: { height: Platform.OS === "ios" ? 84 : 64, paddingTop: 7, paddingBottom: Platform.OS === "ios" ? 20 : 7, backgroundColor: colors.surface, borderTopColor: colors.line }, tabLabel: { fontSize: 10, fontWeight: "700" },
});
