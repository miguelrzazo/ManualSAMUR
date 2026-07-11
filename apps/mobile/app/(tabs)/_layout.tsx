import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";

import { palette } from "@/constants/theme";

function TabIcon({ name, color }: { name: ComponentProps<typeof FontAwesome>["name"]; color: string }) {
  return <FontAwesome name={name} size={21} color={color} />;
}

const icon = (name: ComponentProps<typeof FontAwesome>["name"]) => ({ color }: { color: string }) => <TabIcon name={name} color={color} />;

export default function TabLayout() {
  return <Tabs screenOptions={{ tabBarActiveTintColor: palette.blue, tabBarInactiveTintColor: "#607085", tabBarStyle: { borderTopColor: "#D9E2EE" }, headerTintColor: palette.blue, headerTitleStyle: { fontWeight: "700" } }}>
    <Tabs.Screen name="index" options={{ title: "Manual", tabBarIcon: icon("book") }} />
    <Tabs.Screen name="codigos" options={{ title: "Códigos", tabBarIcon: icon("list-alt") }} />
    <Tabs.Screen name="vademecum" options={{ title: "Vademécum", tabBarIcon: icon("medkit") }} />
    <Tabs.Screen name="mapa" options={{ title: "Mapa", tabBarIcon: icon("map-marker") }} />
  </Tabs>;
}
