import { FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text, View, StyleSheet } from "react-native";

import { commonStyles, palette } from "@/constants/theme";
import { OfflineNotice } from "@/components/OfflineNotice";
import { PressableCard } from "@/components/PressableCard";
import { Screen } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { readFavourites } from "@/lib/favourites";
import { useContent } from "@/providers/ContentProvider";

export default function MoreScreen() {
  const { snapshot, source, refresh, refreshing, error } = useContent();
  const [query, setQuery] = useState("");
  const [favourites, setFavourites] = useState<string[]>([]);
  useEffect(() => { void readFavourites().then(setFavourites); }, []);
  const abbreviations = useMemo(() => snapshot.content.abbreviations.flatMap((section) => section.entries).filter((entry) => `${entry.abbreviation} ${entry.meaning}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))).slice(0, query ? 60 : 16), [snapshot, query]);
  const favouriteProcedures = snapshot.content.procedures.filter((procedure) => favourites.includes(procedure.slug));
  return <Screen onRefresh={() => void refresh()} refreshing={refreshing}>
    <OfflineNotice message={error} />
    <PressableCard onPress={() => void refresh()}><View style={styles.row}><FontAwesome name="refresh" size={18} color={palette.blue} /><View style={{ flex: 1 }}><Text style={commonStyles.title}>{refreshing ? "Actualizando…" : "Actualizar contenido"}</Text><Text style={commonStyles.subtitle}>Versión incluida: {new Date(snapshot.generatedAt).toLocaleDateString("es-ES")} · {source === "cached" ? "guardada en el dispositivo" : "incluida con la app"}</Text></View></View></PressableCard>
    <View style={styles.notice}><Text style={styles.noticeTitle}>Adaptación no oficial</Text><Text style={styles.noticeText}>SAMUR Manual es una adaptación independiente. Confirma siempre las indicaciones clínicas con los protocolos oficiales vigentes.</Text></View>
    <Text style={commonStyles.title}>Favoritos</Text>
    {favouriteProcedures.length ? favouriteProcedures.map((procedure) => <PressableCard key={procedure.slug} onPress={() => router.push({ pathname: "/procedure/[id]", params: { id: procedure.slug } })}><Text style={commonStyles.label}>{procedure.id} · {procedure.section}</Text><Text style={commonStyles.title}>{procedure.title}</Text></PressableCard>) : <Text style={commonStyles.subtitle}>Guarda fichas con la estrella para encontrarlas aquí.</Text>}
    <Text style={commonStyles.title}>Abreviaturas</Text><SearchField value={query} onChangeText={setQuery} placeholder="Buscar abreviatura" />
    {abbreviations.map((entry) => <View style={styles.abbreviation} key={entry.abbreviation}><Text style={styles.abbreviationKey}>{entry.abbreviation}</Text><Text style={styles.abbreviationText}>{entry.meaning}</Text></View>)}
    <View style={styles.appearance}><Text style={commonStyles.title}>Apariencia</Text><Text style={commonStyles.subtitle}>La app respeta automáticamente el modo claro u oscuro, el tamaño de texto del sistema y Reducir movimiento.</Text></View>
  </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", gap: 11, alignItems: "center" }, notice: { borderRadius: 14, padding: 14, backgroundColor: "#FFF5F5", borderWidth: 1, borderColor: "#F3C6C6", gap: 4 }, noticeTitle: { color: palette.red, fontWeight: "800", fontSize: 14 }, noticeText: { color: palette.ink, fontSize: 13, lineHeight: 19 }, abbreviation: { flexDirection: "row", gap: 10, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.border, borderRadius: 12, padding: 11 }, abbreviationKey: { minWidth: 56, color: palette.blue, fontWeight: "800", fontSize: 14 }, abbreviationText: { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 19 }, appearance: { gap: 4, paddingTop: 4 } });
