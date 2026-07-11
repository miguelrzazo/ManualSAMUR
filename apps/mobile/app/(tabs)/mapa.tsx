import { FontAwesome } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { useState } from "react";

import { commonStyles, palette } from "@/constants/theme";
import { nearestHospital } from "@/lib/facilities";
import type { Facility } from "@/lib/types";
import { useContent } from "@/providers/ContentProvider";

const madrid = { latitude: 40.4168, longitude: -3.7038, latitudeDelta: .23, longitudeDelta: .23 };

export default function MapScreen() {
  const { snapshot } = useContent();
  const [showHospitals, setShowHospitals] = useState(true);
  const [showBases, setShowBases] = useState(true);
  const [showPrivate, setShowPrivate] = useState(false);
  const [showStatus4, setShowStatus4] = useState(false);
  const [selected, setSelected] = useState<Facility | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const hospitals = snapshot.content.hospitals.filter((hospital) => showPrivate || hospital.type !== "private");
  const openNavigation = (facility: Facility) => {
    const query = encodeURIComponent(`${facility.lat},${facility.lng}`);
    const url = Platform.select({ ios: `http://maps.apple.com/?daddr=${query}`, android: `geo:0,0?q=${query}` }) ?? `https://www.google.com/maps/dir/?api=1&destination=${query}`;
    void Linking.openURL(url);
  };
  const findNearest = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") { setLocationMessage("No se concedió la ubicación. Puedes seleccionar un hospital en el mapa."); return; }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const result = nearestHospital({ latitude: position.coords.latitude, longitude: position.coords.longitude }, snapshot.content.hospitals);
    if (result) { setSelected(result.hospital); setLocationMessage(`${result.hospital.shortName ?? result.hospital.name} · ${result.distanceKm.toFixed(1)} km en línea recta.`); }
  };
  return <View style={styles.screen}>
    <MapView provider={PROVIDER_DEFAULT} style={styles.map} initialRegion={madrid} accessibilityLabel="Mapa de hospitales y bases de SAMUR">
      {showHospitals && hospitals.map((hospital) => <Marker key={hospital.id} coordinate={{ latitude: hospital.lat, longitude: hospital.lng }} title={hospital.shortName ?? hospital.name} description={hospital.address} pinColor={hospital.type === "private" ? "#3D8B57" : palette.red} onPress={() => setSelected(hospital)} />)}
      {showBases && snapshot.content.bases.map((base) => <Marker key={base.id} coordinate={{ latitude: base.lat, longitude: base.lng }} title={`Base ${base.number ?? ""} ${base.name}`} description={base.address} pinColor={palette.blue} onPress={() => setSelected(base)} />)}
      {showStatus4 && snapshot.content.status4.flatMap((entry) => {
        const hospital = snapshot.content.hospitals.find((candidate) => candidate.id === entry.hospitalId);
        return hospital ? [<Marker key={`status-${entry.status}`} coordinate={{ latitude: hospital.lat, longitude: hospital.lng }} title={`Status 4 · ${entry.status}`} description={entry.description} pinColor={palette.yellow} onPress={() => setSelected(hospital)} />] : [];
      })}
    </MapView>
    <View style={styles.controls}><LayerButton active={showHospitals} label="Hospitales" onPress={() => setShowHospitals((value) => !value)} /><LayerButton active={showPrivate} label="Privados" onPress={() => setShowPrivate((value) => !value)} /><LayerButton active={showBases} label="Bases" onPress={() => setShowBases((value) => !value)} /><LayerButton active={showStatus4} label="Status 4" onPress={() => setShowStatus4((value) => !value)} /><LayerButton active={false} label="Más cercano" onPress={() => void findNearest()} /></View>
    {showStatus4 && <View style={styles.status}><Text style={styles.statusTitle}>Destinos Status 4</Text><Text style={styles.statusText}>{snapshot.content.status4.map((entry) => `${entry.status}: ${entry.hospitalName ?? "—"}`).join(" · ")}</Text></View>}
    {(selected || locationMessage) && <View style={styles.sheet}>{selected && <><Text style={commonStyles.label}>{selected.id}</Text><Text style={commonStyles.title}>{selected.shortName ?? selected.name}</Text><Text style={commonStyles.subtitle}>{selected.address} · {selected.district}</Text><Pressable accessibilityRole="button" onPress={() => openNavigation(selected)} style={styles.navigation}><FontAwesome name="location-arrow" color={palette.white} size={15} /><Text style={styles.navigationText}>Abrir navegación</Text></Pressable></>}{locationMessage && <Text style={styles.location}>{locationMessage}</Text>}</View>}
  </View>;
}
function LayerButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.layer, active && styles.layerActive]}><Text style={[styles.layerText, active && styles.layerTextActive]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ screen: { flex: 1 }, map: { flex: 1 }, controls: { position: "absolute", top: 16, left: 12, gap: 7 }, layer: { backgroundColor: palette.white, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: palette.border, shadowColor: "#000", shadowOpacity: .12, shadowRadius: 6, elevation: 3 }, layerActive: { backgroundColor: palette.blue, borderColor: palette.blue }, layerText: { color: palette.ink, fontWeight: "700", fontSize: 12 }, layerTextActive: { color: palette.white }, status: { position: "absolute", right: 12, left: 12, bottom: 10, backgroundColor: "rgba(255,255,255,.95)", borderRadius: 12, padding: 11 }, statusTitle: { color: palette.blue, fontWeight: "800", fontSize: 12 }, statusText: { color: palette.ink, fontSize: 11, marginTop: 3 }, sheet: { position: "absolute", bottom: 78, left: 12, right: 12, backgroundColor: palette.white, padding: 14, gap: 5, borderRadius: 15, borderWidth: 1, borderColor: palette.border }, navigation: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: palette.blue, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, marginTop: 5 }, navigationText: { color: palette.white, fontWeight: "700", fontSize: 13 }, location: { color: palette.blue, fontSize: 13, fontWeight: "600" } });
