export const VADEMECUM_TABS = [
  { key: "farmacos", label: "Fármacos" },
  { key: "perfusiones", label: "Lista perfusiones" },
  { key: "fluidos", label: "Fluidos" },
  { key: "comerciales", label: "Nombres comerciales" },
] as const;

export type VademecumTabKey = (typeof VADEMECUM_TABS)[number]["key"];
