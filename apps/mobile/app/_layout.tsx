import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { useColorScheme } from "@/components/useColorScheme";
import { ContentProvider } from "@/providers/ContentProvider";

export { ErrorBoundary } from "expo-router";
export const unstable_settings = { initialRouteName: "(tabs)" };

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
          <ContentProvider>
            <Stack screenOptions={{ headerTintColor: "#0B3A6E", headerTitleStyle: { fontWeight: "700" } }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="procedure/[id]" options={{ title: "Procedimiento" }} />
              <Stack.Screen name="drug/[id]" options={{ title: "Vademécum" }} />
              <Stack.Screen name="search" options={{ title: "Buscar", presentation: "modal" }} />
              <Stack.Screen name="more" options={{ title: "Más", presentation: "formSheet" }} />
            </Stack>
          </ContentProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
