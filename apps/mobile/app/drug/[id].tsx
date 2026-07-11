import { useLocalSearchParams } from "expo-router";
import { Text, View, StyleSheet } from "react-native";

import { commonStyles, palette } from "@/constants/theme";
import { Screen } from "@/components/Screen";
import { useContent } from "@/providers/ContentProvider";

const fields: Array<[string, string]> = [["Función", "funcion"], ["Indicación", "indication"], ["Dosis", "dose"], ["Vía", "route"], ["Presentación", "presentation"], ["Contraindicaciones", "contraindications"], ["Efectos secundarios", "efectos_secundarios"], ["Notas", "notes"]];
export default function DrugDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snapshot } = useContent();
  const drug = snapshot.content.drugs.find((item) => item.id === id);
  if (!drug) return <Screen><Text style={commonStyles.title}>No se encontró este fármaco.</Text></Screen>;
  return <Screen><View style={styles.header}><Text style={commonStyles.label}>{String(drug.category ?? "Vademécum")}</Text><Text style={styles.title}>{String(drug.name)}</Text><Text style={commonStyles.subtitle}>{String(drug.subcategory ?? "")}</Text></View>{fields.map(([label, key]) => { const value = drug[key]; const text = Array.isArray(value) ? value.join(" · ") : typeof value === "string" ? value : ""; return text ? <View key={key} style={styles.field}><Text style={commonStyles.label}>{label}</Text><Text style={styles.value}>{text}</Text></View> : null; })}</Screen>;
}
const styles = StyleSheet.create({ header: { backgroundColor: palette.blue, padding: 16, borderRadius: 16, gap: 4 }, title: { color: palette.white, fontSize: 27, lineHeight: 32, fontWeight: "800" }, field: { backgroundColor: palette.white, borderRadius: 14, borderWidth: 1, borderColor: palette.border, padding: 14, gap: 5 }, value: { color: palette.ink, fontSize: 16, lineHeight: 23 } });
