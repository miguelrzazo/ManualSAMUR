import React, { useEffect, useState } from "react";
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { motion, radii, shadows, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle } from "../accessibility.ts";
import { useReduceMotion } from "../hooks/motion.ts";
import { useTheme } from "../theme.tsx";
import { Press } from "./Press.tsx";

/**
 * Un desplegable anclado a su botón, no una hoja.
 *
 * Compartir un procedimiento eran dos acciones, y ocupaban una `pageSheet` a
 * pantalla completa con su propia cabecera, su propio título y su propio botón de
 * cerrar: tres elementos de chrome para elegir entre "enlace" y "PDF". Un menú
 * colgado del icono que lo abre dice lo mismo sin tapar lo que estabas leyendo.
 *
 * Está escrito en JS a propósito. El menú nativo (`UIMenu`) exigiría una
 * dependencia nueva y, con ella, otro `prebuild` y otro binario firmado para un
 * cambio que es de dos filas de texto.
 *
 * El `Modal` sigue siendo necesario: es lo único que dibuja por encima de la
 * barra de navegación nativa, que es justo donde vive el botón que lo abre.
 */
export interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MenuItem {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** Ancho fijo: un menú que cambia de ancho según la acción más larga baila al abrirse. */
const MENU_WIDTH = 248;

export function Menu({ visible, anchor, onClose, items, notice, accessibilityLabel }: {
  visible: boolean;
  anchor: MenuAnchor | undefined;
  onClose: () => void;
  items: MenuItem[];
  /** Línea explicativa bajo las acciones, p. ej. cuando una de ellas no está disponible. */
  notice?: string;
  accessibilityLabel?: string;
}) {
  const palette = useTheme();
  const styles = useStyles(palette);
  const reduceMotion = useReduceMotion();
  // `useState` con inicializador, no `useRef().current`: es el patrón que ya usan
  // `BackToTop` y `TabIcon`, y el que no lee una ref durante el render.
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? motion.instant : motion.fast,
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion, visible]);

  if (!visible) return null;

  const window = Dimensions.get("window");
  // El menú cuelga de la esquina derecha de su botón. Se recorta contra el borde de
  // la pantalla para que un botón muy a la derecha no lo empuje fuera de vista.
  const right = anchor ? Math.max(spacing.sm, window.width - (anchor.x + anchor.width)) : spacing.lg;
  const top = anchor ? anchor.y + anchor.height + spacing.sm : spacing.xxl;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* El fondo es transparente y sólo sirve para cerrar: un velo oscuro convertiría
          dos acciones en un cambio de contexto, que es lo que la hoja ya hacía. */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Cerrar el menú"
        accessibilityHint={accessibilityHints.dismiss}
      />
      <Animated.View
        style={[
          styles.card,
          { top, right },
          {
            opacity: progress,
            transform: reduceMotion ? [] : [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          },
        ]}
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
      >
        {items.map((item, index) => (
          <React.Fragment key={item.key}>
            {index > 0 ? <View style={styles.separator} /> : null}
            <Press
              onPress={item.onPress}
              disabled={item.disabled}
              style={[styles.item, item.disabled === true && styles.itemDisabled]}
              accessibilityRole="menuitem"
              accessibilityLabel={item.accessibilityLabel ?? item.label}
              accessibilityHint={item.accessibilityHint}
              accessibilityState={{ disabled: item.disabled === true }}
            >
              <MaterialCommunityIcons name={item.icon} size={19} color={palette.ink} />
              <Text style={styles.itemLabel} numberOfLines={2} maxFontSizeMultiplier={1.6}>{item.label}</Text>
            </Press>
          </React.Fragment>
        ))}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </Animated.View>
    </Modal>
  );
}

function useStyles(palette: AdaptivePalette) {
  return React.useMemo(() => StyleSheet.create({
    backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    card: {
      position: "absolute",
      width: MENU_WIDTH,
      borderRadius: radii.md,
      backgroundColor: palette.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.line,
      overflow: "hidden",
      // La esquina superior derecha es la que toca el botón, así que es desde donde
      // el menú tiene que crecer.
      transformOrigin: "top right",
      ...shadows.floating,
      shadowColor: palette.black,
    },
    // Radio concéntrico: la fila no lleva esquinas propias porque el `overflow: hidden`
    // de la tarjeta ya las recorta, y una fila redondeada dentro de otra redondeada
    // deja el hueco en pinza que este proyecto ya corrigió en otras superficies.
    item: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, ...accessibilityTargetStyle() },
    itemDisabled: { opacity: 0.45 },
    itemLabel: { ...typography.callout, color: palette.ink, flex: 1 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: palette.line, marginLeft: spacing.lg },
    notice: { ...typography.caption, color: palette.inkMuted, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.xs },
  }), [palette]);
}
