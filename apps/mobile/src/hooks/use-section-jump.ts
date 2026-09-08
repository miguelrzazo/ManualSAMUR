import { useCallback, useMemo, useRef } from "react";
import type { LayoutChangeEvent, SectionList } from "react-native";

/**
 * Saltar a una sección de un `SectionList`.
 *
 * Las fichas de grupo de Códigos y las letras del Vademécum llamaban a
 * `scrollToLocation({ sectionIndex, itemIndex: 0 })` sobre una lista sin
 * `getItemLayout` y con `onScrollToIndexFailed={() => undefined}`. React Native no
 * puede desplazarse a una fila que todavía no ha medido, así que la llamada fallaba,
 * el fallo se tragaba, y al pulsar la ficha no pasaba nada: sin error, sin
 * movimiento, sin pista.
 *
 * Aquí cada cabecera registra su posición al dibujarse y el salto usa esa posición
 * con `scrollTo`, que no depende de que la fila destino esté medida. Si la sección
 * aún no está renderizada, `onScrollToIndexFailed` aproxima el desplazamiento y la
 * cabecera termina el salto cuando React Native la monta.
 *
 * El mismo adaptador se comparte entre Códigos y Vademécum; el bug #108 se producía
 * porque Vademécum sustituía accidentalmente ese callback por un no-op.
 */
export interface SectionJump {
  /** `onLayout` para la cabecera de la sección `key`. */
  registerSection: (key: string) => (event: LayoutChangeEvent) => void;
  /** Salta a la sección. `sectionIndex` es el camino secundario, para las no medidas. */
  jumpTo: (key: string, sectionIndex: number) => void;
  onScrollToIndexFailed: (info: { index: number; averageItemLength: number }) => void;
  /**
   * Las posiciones caducan cuando cambian las secciones (un filtro, una búsqueda).
   * No borra nada si la lista de claves es la misma: quien llama a esto lo hace desde
   * un efecto, y un efecto corre *después* de pintar, o sea después de que las
   * primeras cabeceras hayan registrado su posición. Borrando siempre, la primera
   * pasada tiraba justo las medidas que acababan de llegar.
   */
  resetSections: (keys?: readonly string[]) => void;
}

export function useSectionJump<ItemT, SectionT>(
  listRef: React.RefObject<SectionList<ItemT, SectionT> | null>,
  options: { animated?: boolean } = {},
): SectionJump {
  const animated = options.animated ?? true;
  const offsets = useRef<Record<string, number>>({});
  const order = useRef<string[]>([]);
  const pending = useRef<{ key: string; sectionIndex: number } | null>(null);

  const scrollToOffset = useCallback((y: number, smooth = animated) => {
    listRef.current?.getScrollResponder()?.scrollTo({ y: Math.max(0, y), animated: smooth });
  }, [animated, listRef]);

  const registerSection = useCallback((key: string) => (event: LayoutChangeEvent) => {
    offsets.current[key] = event.nativeEvent.layout.y;
    if (!order.current.includes(key)) order.current.push(key);
    // Si el salto estaba esperando a que esta sección se dibujara, se remata ahora.
    if (pending.current?.key === key) {
      pending.current = null;
      scrollToOffset(event.nativeEvent.layout.y);
    }
  }, [scrollToOffset]);

  const jumpTo = useCallback((key: string, sectionIndex: number) => {
    const offset = offsets.current[key];
    if (typeof offset === "number") {
      pending.current = null;
      scrollToOffset(offset);
      return;
    }
    // Nunca dibujada: se intenta por el camino de React Native y se deja anotado el
    // destino, para que `registerSection` lo remate si la sección llega a dibujarse.
    pending.current = { key, sectionIndex };
    if (sectionIndex >= 0) listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewPosition: 0, animated });
  }, [animated, listRef, scrollToOffset]);

  /**
   * El reintento que documenta React Native: acercarse con la altura media de fila que
   * el propio fallo informa, en vez de tragárselo.
   */
  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    scrollToOffset(info.index * info.averageItemLength, false);
  }, [scrollToOffset]);

  const resetSections = useCallback((keys: readonly string[] = []) => {
    const unchanged = keys.length === order.current.length && keys.every((key, index) => order.current[index] === key);
    order.current = [...keys];
    if (unchanged) return;
    offsets.current = {};
    pending.current = null;
  }, []);

  // Memoizado: el consumidor natural de `resetSections` es un efecto que lleva este
  // objeto en sus dependencias, y un objeto nuevo por render lo dispararía siempre.
  return useMemo(
    () => ({ registerSection, jumpTo, onScrollToIndexFailed, resetSections }),
    [jumpTo, onScrollToIndexFailed, registerSection, resetSections],
  );
}
