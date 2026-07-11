import { useMemo, useState } from "react";
import { Text, View, StyleSheet } from "react-native";

import { commonStyles, palette } from "@/constants/theme";
import { PressableCard } from "@/components/PressableCard";
import { Screen } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { useContent } from "@/providers/ContentProvider";

export default function CodesScreen() {
  const { snapshot } = useContent();
  const [family, setFamily] = useState("incidente");
  const [query, setQuery] = useState("");
  const families = Object.keys(snapshot.content.codes);
  const codes = useMemo(() => (snapshot.content.codes[family] ?? []).filter((code) => JSON.stringify(code).toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))).slice(0, 80), [snapshot, family, query]);
  return <Screen>
    <Text style={commonStyles.subtitle}>Filtra códigos de incidente, patología, comunicaciones, ICAO y referencias operativas.</Text>
    <View style={styles.families}>{families.map((key) => <Text key={key} onPress={() => setFamily(key)} accessibilityRole="button" style={[styles.family, family === key && styles.familyActive]}>{key}</Text>)}</View>
    <SearchField value={query} onChangeText={setQuery} placeholder="Buscar código o descripción" />
    <Text style={commonStyles.label}>{codes.length} resultados · {family}</Text>
    {codes.map((code, index) => { const title = String(code.name ?? code.title ?? code.code ?? "Código"); const value = String(code.code ?? code.key ?? index + 1); const detail = String(code.description ?? code.category ?? code.group ?? ""); return <PressableCard key={`${value}-${index}`} onPress={() => undefined} accessibilityLabel={`${value} ${title}`}><Text style={styles.code}>{value}</Text><Text style={commonStyles.title}>{title}</Text>{Boolean(detail) && <Text style={commonStyles.subtitle}>{detail}</Text>}</PressableCard>; })}
  </Screen>;
}
const styles = StyleSheet.create({ families: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, family: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: palette.border, color: palette.muted, fontSize: 12, overflow: "hidden" }, familyActive: { backgroundColor: palette.blue, borderColor: palette.blue, color: palette.white }, code: { color: palette.red, fontWeight: "800", fontSize: 16 } });
