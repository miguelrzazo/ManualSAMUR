"use client";

import { useSyncExternalStore } from "react";

/**
 * Reloj del cliente, seguro para hidratación.
 *
 * Por qué existe: el sitio se publica como export estático (output: "export"), así
 * que cualquier `Date.now()` en un componente servidor se evalúa una sola vez, en
 * tiempo de build, y se congela en el HTML. Todas las caducidades de la interfaz
 * (insignia "nuevo", banner, aviso de actualización reciente) dependían de eso y
 * dejaron de caducar. Este hook devuelve la hora del *usuario*.
 *
 * Por qué useSyncExternalStore y no useState+useEffect: durante la hidratación React
 * usa `getServerSnapshot`, así que el marcado coincide con el HTML servido y solo
 * después vuelve a renderizar con la hora real. Evita a la vez el desajuste de
 * hidratación y la regla react-hooks/set-state-in-effect.
 *
 * La instantánea se redondea al minuto para que sea estable entre renders: devolver
 * `Date.now()` en crudo cambiaría en cada lectura y provocaría un bucle de renders.
 */

const BUCKET_MS = 60_000;

const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (intervalId === null) {
    intervalId = setInterval(notify, BUCKET_MS);
    // Al volver a la pestaña: una sesión abierta días seguidos también debe caducar.
    window.addEventListener("focus", notify);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      window.removeEventListener("focus", notify);
      intervalId = null;
    }
  };
}

function getSnapshot(): number {
  return Math.floor(Date.now() / BUCKET_MS);
}

/** En servidor no hay "ahora" utilizable: null obliga a quien lo use a no decidir aún. */
function getServerSnapshot(): null {
  return null;
}

/**
 * Devuelve el instante actual en ms (redondeado al minuto), o `null` mientras se
 * renderiza en servidor / antes de hidratar. Trata `null` como "todavía no se sabe"
 * y renderiza el estado neutro (normalmente: no mostrar el aviso caducable).
 */
export function useNow(): number | null {
  const bucket = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return bucket === null ? null : bucket * BUCKET_MS;
}
