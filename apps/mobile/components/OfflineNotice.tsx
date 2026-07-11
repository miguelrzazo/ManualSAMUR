import { Text, StyleSheet, View } from "react-native";
export function OfflineNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return <View style={styles.notice}><Text style={styles.text}>Sin conexión: se muestra el contenido disponible en el dispositivo.</Text></View>;
}
const styles = StyleSheet.create({ notice: { backgroundColor: "#FFF6D8", borderColor: "#E6B84C", borderWidth: 1, borderRadius: 10, padding: 10 }, text: { color: "#6C4C00", fontSize: 13, lineHeight: 18 } });
