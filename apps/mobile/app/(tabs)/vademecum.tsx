import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View, StyleSheet } from "react-native";

import { commonStyles, palette } from "@/constants/theme";
import { PressableCard } from "@/components/PressableCard";
import { Screen } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { useContent } from "@/providers/ContentProvider";

type Tab = "drugs" | "perfusions" | "fluids" | "commercialNames";
const labels: Record<Tab, string> = { drugs: "Fármacos", perfusions: "Perfusiones", fluids: "Fluidos", commercialNames: "Comerciales" };

export default function VademecumScreen() {
  const { snapshot } = useContent();
  const [tab, setTab] = useState<Tab>("drugs");
  const [query, setQuery] = useState("");
  const source = snapshot.content[tab];
  const rows = useMemo(() => source.filter((row) => JSON.stringify(row).toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))).slice(0, 100), [source, query]);
  return <Screen>
    <View style={styles.tabs}>{(Object.keys(labels) as Tab[]).map((key) => <Text key={key} accessibilityRole="button" onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>{labels[key]}</Text>)}</View>
    <SearchField value={query} onChangeText={setQuery} placeholder={`Buscar en ${labels[tab].toLowerCase()}`} />
    {rows.map((row, index) => { const id = String(row.id ?? row.name ?? index); const title = String(row.name ?? row.activeIngredient ?? row.title ?? "Referencia"); const subtitle = String(row.category ?? row.indication ?? row.presentation ?? row.description ?? ""); const canOpen = tab === "drugs" && typeof row.id === "string"; return <PressableCard key={id} onPress={() => canOpen ? router.push({ pathname: "/drug/[id]", params: { id } }) : undefined} accessibilityLabel={title}><Text style={commonStyles.title}>{title}</Text>{Boolean(subtitle) && <Text style={commonStyles.subtitle} numberOfLines={3}>{subtitle}</Text>}{canOpen && <Text style={styles.open}>Ver ficha clínica</Text>}</PressableCard>; })}
  </Screen>;
}
const styles = StyleSheet.create({ tabs: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, tab: { borderRadius: 99, borderWidth: 1, borderColor: palette.border, color: palette.muted, fontSize: 12, paddingHorizontal: 10, paddingVertical: 6, overflow: "hidden" }, tabActive: { backgroundColor: palette.blue, color: palette.white, borderColor: palette.blue }, open: { color: palette.blue, fontSize: 13, fontWeight: "700", marginTop: 3 } });
