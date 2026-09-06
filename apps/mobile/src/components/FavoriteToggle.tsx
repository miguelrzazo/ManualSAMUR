import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { accessibilityHints } from "../accessibility.ts";
import { lightImpact } from "../hooks/haptics.ts";
import { useTheme } from "../theme.tsx";
import { Press } from "./Press.tsx";

/**
 * The single favourite control.
 *
 * There were six copies of this button and, between them, three different ways
 * of saying the same thing to VoiceOver — "Quitar de favoritos", "Quitar de
 * guardados" and "Quitar {title} de favoritos". A screen reader user moving
 * between Inicio and a procedure heard the same control named two different
 * ways. One phrasing now, everywhere, and it names the item when it can.
 */
export function FavoriteToggle({ favorite, onToggle, title, size = 22 }: {
  favorite: boolean;
  onToggle: () => void;
  /** Included in the spoken label when the row's title is not already focused. */
  title?: string;
  size?: number;
}) {
  const palette = useTheme();
  const subject = title ? ` ${title}` : "";
  return (
    <Press
      onPress={() => {
        lightImpact();
        onToggle();
      }}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={favorite ? `Quitar${subject} de favoritos` : `Guardar${subject} en favoritos`}
      accessibilityHint={accessibilityHints.toggleFavorite}
      accessibilityState={{ selected: favorite }}
      style={styles.button}
    >
      <MaterialCommunityIcons
        name={favorite ? "star" : "star-outline"}
        size={size}
        color={favorite ? palette.amber : palette.inkMuted}
      />
    </Press>
  );
}

const styles = {
  /** Centred so the star sits on the row's optical centre, not above its first line. */
  button: { alignItems: "center", justifyContent: "center" },
} as const;
