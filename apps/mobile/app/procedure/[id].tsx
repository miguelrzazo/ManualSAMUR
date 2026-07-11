import { FontAwesome } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import { useEffect, useMemo, useRef, useState } from "react";

import { commonStyles, palette } from "@/constants/theme";
import { PressableCard } from "@/components/PressableCard";
import { Screen } from "@/components/Screen";
import { readFavourites, toggleFavourite } from "@/lib/favourites";
import { useContent } from "@/providers/ContentProvider";

export default function ProcedureDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snapshot } = useContent();
  const procedure = snapshot.content.procedures.find((item) => item.id === id);
  const [favourite, setFavourite] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const headingOffsets = useRef<Record<string, number>>({});
  const sections = useMemo(() => procedure?.content.split(/(?=^#{1,3}\s+.+$)/m) ?? [], [procedure]);
  const headings = useMemo(() => sections.map((section) => section.match(/^#{1,3}\s+(.+)$/m)?.[1]).filter((heading): heading is string => Boolean(heading)), [sections]);
  useEffect(() => { void readFavourites().then((items) => setFavourite(items.includes(id))); }, [id]);
  if (!procedure) return <Screen><Text style={commonStyles.title}>No se encontró este procedimiento.</Text></Screen>;
  const save = async () => { setFavourite((value) => !value); await toggleFavourite(procedure.id); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };
  const scrollToHeading = (heading: string) => scrollRef.current?.scrollTo({ y: Math.max(0, headingOffsets.current[heading] ?? 0), animated: true });
  return <Screen scrollRef={scrollRef}>
    <View style={styles.header}><View style={{ flex: 1 }}><Text style={commonStyles.label}>{procedure.id} · {procedure.section}</Text><Text style={styles.title}>{procedure.title}</Text>{Boolean(procedure.updated) && <Text style={commonStyles.subtitle}>Revisión: {procedure.updated}</Text>}</View><Pressable onPress={() => void save()} accessibilityRole="button" accessibilityLabel={favourite ? "Quitar de favoritos" : "Añadir a favoritos"} style={styles.favorite}><FontAwesome name={favourite ? "star" : "star-o"} size={20} color={palette.yellow} /></Pressable></View>
    {headings.length > 0 && <View style={styles.anchors}><Text style={styles.anchorTitle}>En esta ficha</Text>{headings.slice(0, 8).map((heading) => <Pressable key={heading} onPress={() => scrollToHeading(heading)} accessibilityRole="link"><Text style={styles.anchor}>• {heading}</Text></Pressable>)}</View>}
    <View style={styles.markdown}>{sections.map((section, index) => { const heading = section.match(/^#{1,3}\s+(.+)$/m)?.[1]; return <View key={`${heading ?? "intro"}-${index}`} onLayout={(event) => { if (heading) headingOffsets.current[heading] = event.nativeEvent.layout.y; }}><Markdown style={markdownStyles}>{section}</Markdown></View>; })}</View>
    {procedure.attachments.length > 0 && <View style={styles.attachments}><Text style={commonStyles.title}>Adjuntos</Text>{procedure.attachments.map((attachment) => <Pressable key={attachment.sourceUrl} onPress={() => void Linking.openURL(attachment.sourceUrl)} accessibilityRole="link" style={styles.attachment}><FontAwesome name="paperclip" color={palette.blue} size={14} /><Text style={styles.attachmentText}>{attachment.localPath.split("/").pop()}</Text></Pressable>)}</View>}
    {procedure.related.length > 0 && <View style={{ gap: 8 }}><Text style={commonStyles.title}>Procedimientos relacionados</Text>{procedure.related.map((relatedId) => { const related = snapshot.content.procedures.find((item) => item.id === relatedId); return related ? <PressableCard key={related.id} onPress={() => router.push({ pathname: "/procedure/[id]", params: { id: related.id } })}><Text style={commonStyles.label}>{related.id} · {related.section}</Text><Text style={commonStyles.title}>{related.title}</Text></PressableCard> : null; })}</View>}
  </Screen>;
}
const styles = StyleSheet.create({ header: { flexDirection: "row", gap: 12 }, title: { color: palette.ink, fontSize: 25, fontWeight: "800", lineHeight: 31, marginTop: 3 }, favorite: { height: 42, width: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, borderColor: palette.border, borderWidth: 1, backgroundColor: palette.white }, anchors: { backgroundColor: palette.blueSoft, padding: 13, borderRadius: 13, gap: 4 }, anchorTitle: { color: palette.blue, fontWeight: "800", fontSize: 13, marginBottom: 2 }, anchor: { color: palette.ink, fontSize: 13, lineHeight: 19 }, markdown: { backgroundColor: palette.white, borderRadius: 15, borderColor: palette.border, borderWidth: 1, padding: 14 }, attachments: { gap: 8 }, attachment: { flexDirection: "row", gap: 8, alignItems: "center", padding: 11, borderRadius: 10, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.border }, attachmentText: { color: palette.blue, fontSize: 14, fontWeight: "600" } });
const markdownStyles = { body: { color: palette.ink, fontSize: 16, lineHeight: 24 }, heading1: { color: palette.blue, fontSize: 23, fontWeight: "800", marginTop: 14, marginBottom: 8 }, heading2: { color: palette.blue, fontSize: 20, fontWeight: "800", marginTop: 12, marginBottom: 6 }, heading3: { color: palette.ink, fontSize: 18, fontWeight: "700", marginTop: 10, marginBottom: 5 }, bullet_list: { marginBottom: 8 }, table: { borderWidth: 1, borderColor: palette.border }, th: { backgroundColor: palette.blueSoft, padding: 6 }, td: { padding: 6, borderColor: palette.border, borderWidth: 1 } } as const;
