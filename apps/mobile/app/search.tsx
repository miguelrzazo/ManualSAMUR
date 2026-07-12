import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, StyleSheet } from "react-native";

import { commonStyles, palette } from "@/constants/theme";
import { PressableCard } from "@/components/PressableCard";
import { Screen } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { useContent } from "@/providers/ContentProvider";
import { matchesSearch } from "@/lib/search";

type Result = { id: string; type: string; title: string; subtitle: string; onPress: () => void };
export default function GlobalSearch() {
  const { snapshot } = useContent();
  const [query, setQuery] = useState("");
  const results = useMemo<Result[]>(() => {
    if (!query.trim()) return [];
    const matches = (value: unknown) => matchesSearch(value, query);
    const procedures = snapshot.content.procedures.filter(matches).slice(0, 8).map((item) => ({ id: item.routeKey, type: "Procedimiento", title: item.title, subtitle: `${item.id} · ${item.section}`, onPress: () => router.push({ pathname: "/procedure/[id]", params: { id: item.routeKey } }) }));
    const drugs = snapshot.content.drugs.filter(matches).slice(0, 6).map((item) => ({ id: String(item.id), type: "Fármaco", title: String(item.name), subtitle: String(item.category ?? "Vademécum"), onPress: () => router.push({ pathname: "/drug/[id]", params: { id: String(item.id) } }) }));
    const facilities = [...snapshot.content.hospitals, ...snapshot.content.bases].filter(matches).slice(0, 6).map((item) => ({ id: item.id, type: item.number == null ? "Hospital" : "Base", title: item.shortName ?? item.name, subtitle: `${item.address} · ${item.district}`, onPress: () => router.replace("/(tabs)/mapa") }));
    const abbreviations = snapshot.content.abbreviations.flatMap((section) => section.entries).filter(matches).slice(0, 6).map((item) => ({ id: item.abbreviation, type: "Abreviatura", title: item.abbreviation, subtitle: item.meaning, onPress: () => router.push("/more") }));
    const codes = Object.values(snapshot.content.codes).flat().filter(matches).slice(0, 6).map((item, index) => ({ id: `${item.code ?? item.name}-${index}`, type: "Código", title: String(item.name ?? item.code ?? "Código"), subtitle: String(item.code ?? item.description ?? ""), onPress: () => router.replace("/(tabs)/codigos") }));
    return [...procedures, ...drugs, ...facilities, ...abbreviations, ...codes];
  }, [snapshot, query]);
  return <Screen><SearchField value={query} onChangeText={setQuery} placeholder="Procedimientos, códigos, fármacos, hospitales…" />{query ? <Text style={commonStyles.label}>{results.length} resultados</Text> : <Text style={styles.hint}>Escribe al menos una palabra para buscar en todo el manual.</Text>}{results.map((result) => <PressableCard key={`${result.type}-${result.id}`} onPress={result.onPress}><Text style={styles.type}>{result.type}</Text><Text style={commonStyles.title}>{result.title}</Text><Text style={commonStyles.subtitle}>{result.subtitle}</Text></PressableCard>)}</Screen>;
}
const styles = StyleSheet.create({ hint: { color: palette.muted, lineHeight: 21 }, type: { color: palette.red, fontSize: 12, fontWeight: "800", textTransform: "uppercase" } });
