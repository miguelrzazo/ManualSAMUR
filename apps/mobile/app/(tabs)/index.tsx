import { FontAwesome } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";

import { commonStyles, palette } from "@/constants/theme";
import { OfflineNotice } from "@/components/OfflineNotice";
import { PressableCard } from "@/components/PressableCard";
import { Screen } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { useContent } from "@/providers/ContentProvider";
import { matchesSearch } from "@/lib/search";

export default function ManualScreen() {
  const { snapshot, refresh, refreshing, error } = useContent();
  const [query, setQuery] = useState("");
  const procedures = useMemo(() => snapshot.content.procedures.filter((procedure) => !query || matchesSearch(`${procedure.id} ${procedure.title} ${procedure.tags.join(" ")} ${procedure.synonyms.join(" ")} ${procedure.searchText}`, query)).slice(0, query ? 30 : 10), [snapshot, query]);
  const sections = [...new Set(snapshot.content.procedures.map((procedure) => procedure.section))];
  return <Screen onRefresh={() => void refresh()} refreshing={refreshing}>
    <View style={styles.brand}><View style={styles.brandMark}><FontAwesome name="plus" size={16} color={palette.white} /></View><View><Text style={styles.brandTitle}>SAMUR Manual</Text><Text style={styles.brandCaption}>Consulta clínica sin conexión</Text></View><FontAwesome.Button name="search" backgroundColor="transparent" color={palette.blue} onPress={() => router.push("/search")} accessibilityLabel="Abrir búsqueda global" /></View>
    <OfflineNotice message={error} />
    <SearchField value={query} onChangeText={setQuery} placeholder="Buscar procedimientos" />
    {!query && <View style={styles.sectionRow}>{sections.map((section) => <Text key={section} style={styles.section}>{section}</Text>)}</View>}
    <Text style={commonStyles.label}>{query ? "Resultados" : "Procedimientos recientes"}</Text>
    {procedures.map((procedure, index) => <Animated.View key={procedure.routeKey} entering={FadeInDown.delay(Math.min(index * 24, 180)).duration(220).reduceMotion(ReduceMotion.System)}><PressableCard onPress={() => router.push({ pathname: "/procedure/[id]", params: { id: procedure.routeKey } })} accessibilityLabel={`Abrir ${procedure.title}`}><Text style={styles.code}>{procedure.id} · {procedure.section}</Text><Text style={commonStyles.title}>{procedure.title}</Text><Text style={commonStyles.subtitle} numberOfLines={2}>{procedure.searchText}</Text></PressableCard></Animated.View>)}
    <PressableCard onPress={() => router.push("/more")}><Text style={commonStyles.title}>Más opciones</Text><Text style={commonStyles.subtitle}>Abreviaturas, favoritos, apariencia y estado del contenido.</Text></PressableCard>
  </Screen>;
}
const styles = StyleSheet.create({ brand: { flexDirection: "row", alignItems: "center", gap: 10 }, brandMark: { height: 34, width: 34, borderRadius: 17, backgroundColor: palette.blue, alignItems: "center", justifyContent: "center" }, brandTitle: { fontSize: 21, fontWeight: "800", color: palette.ink }, brandCaption: { color: palette.muted, fontSize: 12 }, code: { fontSize: 12, color: palette.blue, fontWeight: "700" }, sectionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, section: { color: palette.blue, backgroundColor: palette.blueSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, fontSize: 12, overflow: "hidden" } });
