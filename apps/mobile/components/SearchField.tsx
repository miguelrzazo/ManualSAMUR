import { FontAwesome } from "@expo/vector-icons";
import { StyleSheet, TextInput, View } from "react-native";

import { palette } from "@/constants/theme";

export function SearchField({ value, onChangeText, placeholder = "Buscar" }: { value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  return <View style={styles.wrap}><FontAwesome name="search" size={16} color={palette.muted} /><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.muted} style={styles.input} autoCorrect={false} returnKeyType="search" accessibilityLabel={placeholder} /></View>;
}
const styles = StyleSheet.create({ wrap: { flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 12, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12, height: 46 }, input: { flex: 1, color: palette.ink, fontSize: 16, minHeight: 42 } });
