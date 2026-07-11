import { useLocalSearchParams } from "expo-router";
import { Text, View, StyleSheet } from "react-native";

import { commonStyles, palette } from "@/constants/theme";
import { Screen } from "@/components/Screen";
import { useContent } from "@/providers/ContentProvider";

export default function ReferenceDetail() {
  const { kind, id } = useLocalSearchParams<{ kind: "perfusions" | "fluids" | "commercialNames"; id: string }>();
  const { snapshot } = useContent();
  const collection = kind === "perfusions" ? snapshot.content.perfusions : kind === "fluids" ? snapshot.content.fluids : snapshot.content.commercialNames;
  const item = collection.find((entry) => String(entry.id ?? entry.drugId) === id);
  if (!item) return <Screen><Text style={commonStyles.title}>No se encontró esta referencia.</Text></Screen>;
  const title = String(item.name ?? item.drug ?? item.activeIngredient ?? "Referencia");
  return <Screen><View style={styles.header}><Text style={commonStyles.label}>{kind === "perfusions" ? "Perfusión" : kind === "fluids" ? "Fluido" : "Nombre comercial"}</Text><Text style={styles.title}>{title}</Text></View>{Object.entries(item).filter(([key]) => !["id", "name", "drug", "drugId", "activeIngredient"].includes(key)).map(([key, value]) => <View key={key} style={styles.field}><Text style={commonStyles.label}>{key.replace(/([A-Z])/g, " $1")}</Text><Text style={styles.value}>{Array.isArray(value) ? value.join(" · ") : String(value)}</Text></View>)}</Screen>;
}
const styles = StyleSheet.create({ header: { backgroundColor: palette.blue, padding: 16, borderRadius: 16, gap: 4 }, title: { color: palette.white, fontSize: 27, lineHeight: 32, fontWeight: "800" }, field: { backgroundColor: palette.white, borderRadius: 14, borderWidth: 1, borderColor: palette.border, padding: 14, gap: 5 }, value: { color: palette.ink, fontSize: 16, lineHeight: 23 } });
