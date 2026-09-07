import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { motion, radii, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle, routeAccessibilityLabels } from "../accessibility.ts";
import { selectionTick } from "../hooks/haptics.ts";
import { useReduceMotion } from "../hooks/motion.ts";
import { GlassCapsule, TAB_ICON_SIZE } from "../nav-shell.tsx";
import { READER_NAV_CAPSULE } from "../scroll-chrome-logic.ts";
import { Press } from "./Press.tsx";

export { READER_NAV_CAPSULE };

/**
 * La barra de navegación del lector, minimizada.
 *
 * El lector es una pantalla apilada: no lleva barra de pestañas debajo, así que
 * durante un procedimiento largo no hay forma de saltar a otro destino sin volver
 * atrás primero. iOS 26 resuelve esto con `TabBarMinimizeBehavior` — la barra se
 * encoge a una sola cápsula en la esquina inicial y vuelve a crecer al tocarla o
 * al llegar arriba del todo. Aquí está dibujado a mano porque la barra de esta app
 * es de JS (`nav-shell.tsx`) y nunca va a recibir el comportamiento nativo.
 *
 * Comparte `GlassCapsule` con la barra real: si el cristal deja de estar disponible
 * en un dispositivo, las dos superficies degradan a la vez y de la misma forma.
 */
export interface ReaderNavDestination {
  route: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  activeIcon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}

/**
 * Los mismos cuatro destinos y el mismo buscador desprendido que dibuja
 * `GlassTabBar`, en el mismo orden. La lista está aquí y no leída del navegador
 * porque el lector no vive dentro del `Tab.Navigator` y no tiene `state.routes`
 * que consultar.
 */
export const READER_NAV_DESTINATIONS: readonly ReaderNavDestination[] = [
  { route: "Inicio", label: "Inicio", icon: "home-variant-outline", activeIcon: "home-variant" },
  { route: "Codigos", label: "Códigos", icon: "radio-handheld" },
  { route: "VademecumList", label: "Vademécum", icon: "pill" },
  { route: "Mapa", label: "Mapa", icon: "map-outline", activeIcon: "map" },
] as const;

export function ReaderNavBar({ expanded, onToggle, onNavigate, palette }: {
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  onNavigate: (route: string) => void;
  palette: AdaptivePalette;
}) {
  const reduceMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));

  /**
   * Sólo se anima la escala, y sólo está montado uno de los dos estados.
   *
   * La primera versión mantenía las dos formas montadas y las cruzaba en opacidad,
   * que es lo que hace que una transición así se sienta como un despliegue. No se
   * puede: `GlassView` es un `UIVisualEffectView`, y un `UIVisualEffectView` deja de
   * dibujar su fondo en cuanto un ancestro lleva opacidad de capa —que es
   * exactamente lo que hace `useNativeDriver` con `opacity`—. En el simulador se veía
   * el resultado: los cuatro iconos y sus etiquetas flotando sobre el texto del
   * procedimiento, sin cápsula debajo.
   *
   * La escala sí sobrevive, así que la transición es un pequeño crecimiento desde la
   * esquina en la que estaba la cápsula minimizada. Menos de lo que se quería, pero
   * con el cristal puesto.
   */
  useEffect(() => {
    if (reduceMotion) return;
    scale.setValue(0.9);
    Animated.timing(scale, {
      toValue: 1,
      duration: expanded ? motion.base : motion.fast,
      useNativeDriver: true,
    }).start();
  }, [expanded, reduceMotion, scale]);

  const go = (route: string) => {
    selectionTick();
    onNavigate(route);
  };

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <Animated.View style={[styles.layer, expanded && styles.expandedLayer, { transform: [{ scale }] }]}>
        {expanded ? (
          <>
            <GlassCapsule palette={palette} style={styles.tabCapsule}>
              <View style={styles.tabRow} accessibilityRole="tablist" accessibilityLabel="Navegación principal">
                {READER_NAV_DESTINATIONS.map((destination) => (
                  <Press
                    key={destination.route}
                    onPress={() => go(destination.route)}
                    style={[styles.tabItem, accessibilityTargetStyle()]}
                    accessibilityRole="tab"
                    accessibilityLabel={destination.label}
                    accessibilityHint={accessibilityHints.switchTab}
                  >
                    <MaterialCommunityIcons name={destination.icon} size={TAB_ICON_SIZE} color={palette.inkMuted} />
                    <Text style={[styles.tabItemLabel, { color: palette.inkMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>{destination.label}</Text>
                  </Press>
                ))}
              </View>
            </GlassCapsule>
            <GlassCapsule palette={palette} style={styles.searchCapsule}>
              <Press
                onPress={() => go("Buscar")}
                style={styles.searchButton}
                accessibilityRole="tab"
                accessibilityLabel={routeAccessibilityLabels.Buscar}
                accessibilityHint={accessibilityHints.search}
              >
                <MaterialCommunityIcons name="magnify" size={24} color={palette.ink} />
              </Press>
            </GlassCapsule>
          </>
        ) : (
          <GlassCapsule palette={palette} style={styles.minimizedCapsule}>
            <Press
              onPress={() => { selectionTick(); onToggle(true); }}
              style={styles.minimizedButton}
              accessibilityRole="button"
              accessibilityLabel="Abrir la navegación"
              accessibilityHint="Despliega los destinos principales sin salir del procedimiento."
              accessibilityState={{ expanded: false }}
            >
              <MaterialCommunityIcons name="home-variant-outline" size={24} color={palette.ink} />
            </Press>
          </GlassCapsule>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "absolute", left: 0, right: 0, bottom: READER_NAV_CAPSULE.bottom, paddingHorizontal: READER_NAV_CAPSULE.left },
  // La cápsula crece desde su esquina inferior izquierda, que es donde estaba cuando
  // estaba minimizada.
  layer: { position: "absolute", left: READER_NAV_CAPSULE.left, bottom: 0, transformOrigin: "bottom left" },
  expandedLayer: { right: READER_NAV_CAPSULE.left, flexDirection: "row", alignItems: "center", columnGap: spacing.xl },
  minimizedCapsule: { borderRadius: radii.pill, width: READER_NAV_CAPSULE.size, height: READER_NAV_CAPSULE.size, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  minimizedButton: { width: READER_NAV_CAPSULE.size, height: READER_NAV_CAPSULE.size, alignItems: "center", justifyContent: "center" },
  tabCapsule: { flex: 1, borderRadius: radii.pill, overflow: "hidden" },
  tabRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, gap: 2, paddingVertical: 2 },
  tabItemLabel: { ...typography.caption2, fontWeight: "500" },
  searchCapsule: { borderRadius: radii.pill, width: 56, height: 56, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  searchButton: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
});
