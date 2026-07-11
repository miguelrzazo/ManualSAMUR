import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import { palette } from "@/constants/theme";

function ManualTabIcon({ color }: { color: string }) { return <FontAwesome name="book" size={21} color={color} />; }
function CodesTabIcon({ color }: { color: string }) { return <FontAwesome name="list-alt" size={21} color={color} />; }
function VademecumTabIcon({ color }: { color: string }) { return <FontAwesome name="medkit" size={21} color={color} />; }
function MapTabIcon({ color }: { color: string }) { return <FontAwesome name="map-marker" size={21} color={color} />; }

export default function TabLayout() {
  return <Tabs screenOptions={{ tabBarActiveTintColor: palette.blue, tabBarInactiveTintColor: "#607085", tabBarStyle: { borderTopColor: "#D9E2EE" }, headerTintColor: palette.blue, headerTitleStyle: { fontWeight: "700" } }}>
    <Tabs.Screen name="index" options={{ title: "Manual", tabBarIcon: ManualTabIcon }} />
    <Tabs.Screen name="codigos" options={{ title: "Códigos", tabBarIcon: CodesTabIcon }} />
    <Tabs.Screen name="vademecum" options={{ title: "Vademécum", tabBarIcon: VademecumTabIcon }} />
    <Tabs.Screen name="mapa" options={{ title: "Mapa", tabBarIcon: MapTabIcon }} />
  </Tabs>;
}
