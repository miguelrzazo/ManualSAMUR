/**
 * The single mapping between app screens and web URLs. Handoff uses it forward
 * (focused screen → `NSUserActivity.webpageURL`, so Safari on the Mac opens the
 * same page) and universal links use it in reverse (https URL → screen).
 *
 * The web routes it targets are the real ones under `app/` and the query
 * params their views read:
 *   /manual/{slug}                       app/manual/[slug]/page.tsx
 *   /vademecum?farmaco={drugId}          components/vademecum/VademecumView.tsx
 *   /vademecum?perfusion={perf.drug}     (matched on the display name, not the id)
 *   /codigos?tab={tab}[&subtab=…]&code=  components/codigos/CodigosView.tsx
 *   /mapa?hospital={id} | ?base={id}     components/mapa/MapaView.tsx
 *
 * Pure and client-safe: runs under React Native and under `node --test`.
 */
import type { MobileContent } from "./data/schema.ts";
import type { RootStackParamList } from "./navigation-types.ts";
import { resolveProcedureReference } from "./procedure-logic.ts";

export const WEB_ORIGIN = "https://manualsamur.miguelrzazo13.workers.dev";
export const HANDOFF_ACTIVITY_TYPE = "es.madrid.samur.manual.view";
export const APPLE_APP_ID = "FC8DH72682.es.madrid.samur.manual";

/**
 * Paths the app claims in `/.well-known/apple-app-site-association`. Anything not
 * listed (the editorial back office, the API, PDFs under /docs) stays in Safari.
 * `tests/web-route-mapping.test.ts` keeps the published file in step with this.
 */
export const UNIVERSAL_LINK_PATHS = [
  "/manual", "/manual/", "/manual/*",
  "/vademecum", "/vademecum/",
  "/codigos", "/codigos/",
  "/mapa", "/mapa/",
  "/abreviaturas", "/abreviaturas/",
  "/cambios", "/cambios/",
] as const;
export const UNIVERSAL_LINK_EXCLUDED_PATHS = ["/gestion-editorial*", "/api/*"] as const;

/** Code groups that the web shows as top-level tabs on /codigos. */
const TOP_CODE_TABS = new Set(["incidente", "svb", "sva", "upsi", "upsq"]);
/** Code groups that the web nests under `tab=otros&subtab=…`. */
const OTROS_CODE_SUBTABS = new Set(["icao", "indicativos", "claves", "lima"]);

/** A leaf route as React Navigation reports it from `getCurrentRoute()`. */
export interface FocusedRoute {
  name: string;
  params?: object;
}

/** What `navigation.navigate` needs to show the screen for an incoming URL. */
export type AppRouteTarget =
  | { screen: "Tabs"; params: { screen: "Inicio" | "Codigos" | "VademecumList" | "Mapa" } }
  | { screen: "Procedure"; params: { id: string } }
  | { screen: "Drug"; params: { id: string } }
  | { screen: "Vademecum"; params: { routeKey: string } }
  | { screen: "Code"; params: { routeKey: string } }
  | { screen: "Location"; params: { routeKey: string } }
  | { screen: "Abbreviations" }
  | { screen: "Historial" };

/** Compile-time guard: every target is a real stack screen with params it accepts. */
type NavigableTarget = {
  [K in keyof RootStackParamList]: undefined extends RootStackParamList[K]
    ? { screen: K; params?: RootStackParamList[K] }
    : { screen: K; params: RootStackParamList[K] };
}[keyof RootStackParamList];
type AssertNavigable<T extends NavigableTarget> = T;
export type CheckedAppRouteTarget = AssertNavigable<AppRouteTarget>;

export interface WebActivity {
  url: string;
  title: string;
}

export type WebRouteContent = Pick<MobileContent, "procedures" | "drugs" | "perfusions" | "codes" | "hospitals" | "bases">;

function param(route: FocusedRoute, key: string): string {
  const value = (route.params as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" ? value : "";
}

function text(record: Record<string, unknown> | undefined, ...keys: string[]): string {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function withQuery(path: string, query: Record<string, string>): string {
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
}

function codeTitle(content: WebRouteContent, group: string, code: string): string {
  const record = (content.codes[group] as Record<string, unknown>[] | undefined)?.find((item) => text(item, "code", "key") === code || text(item, "name", "title", "label") === code);
  const name = text(record, "name", "title", "label");
  return [code, name].filter(Boolean).join(" · ") || "Códigos";
}

function codeWebPath(group: string, code: string): string {
  if (TOP_CODE_TABS.has(group)) return withQuery("/codigos", { tab: group, code });
  if (OTROS_CODE_SUBTABS.has(group)) return withQuery("/codigos", { tab: "otros", subtab: group, code });
  return "/codigos";
}

function vademecumWebPath(content: WebRouteContent, routeKey: string): { path: string; title: string } {
  const match = /^vademecum:(drug|perfusion|fluid|commercialName):(.+)$/.exec(routeKey);
  if (!match) return { path: "/vademecum", title: "Vademécum" };
  const [, kind, id] = match;
  if (kind === "drug") {
    const drug = content.drugs.find((item) => String(item.id) === id);
    return { path: withQuery("/vademecum", { farmaco: id }), title: text(drug, "name") || id };
  }
  if (kind === "perfusion") {
    const perfusion = content.perfusions.find((item) => text(item, "id", "drugId", "drug") === id);
    const drugName = text(perfusion, "drug");
    return drugName
      ? { path: withQuery("/vademecum", { perfusion: drugName }), title: `Perfusión de ${drugName}` }
      : { path: "/vademecum", title: "Vademécum" };
  }
  if (kind === "commercialName") {
    const drugId = id.split(":")[0];
    return content.drugs.some((item) => String(item.id) === drugId)
      ? { path: withQuery("/vademecum", { farmaco: drugId }), title: text(content.drugs.find((item) => String(item.id) === drugId), "name") || drugId }
      : { path: "/vademecum", title: "Vademécum" };
  }
  return { path: "/vademecum", title: "Vademécum" };
}

/** Forward direction: the focused app screen → its web page, or null when the web has no equivalent. */
export function appRouteToWebActivity(route: FocusedRoute, content: WebRouteContent, origin = WEB_ORIGIN): WebActivity | null {
  const resolved = appRouteToWebPath(route, content);
  return resolved ? { url: `${origin}${resolved.path}`, title: resolved.title } : null;
}

export function appRouteToWebPath(route: FocusedRoute, content: WebRouteContent): { path: string; title: string } | null {
  switch (route.name) {
    case "Inicio":
    case "Buscar":
      return { path: "/manual", title: "Manual SAMUR" };
    case "Codigos":
      return { path: "/codigos", title: "Códigos" };
    case "VademecumList":
      return { path: "/vademecum", title: "Vademécum" };
    case "Mapa":
      return { path: "/mapa", title: "Mapa" };
    case "Status4":
      return { path: "/codigos", title: "Status 4" };
    case "Abbreviations":
      return { path: "/abreviaturas", title: "Abreviaturas" };
    case "Historial":
      return { path: "/cambios", title: "Historial de cambios" };
    case "Procedure": {
      const procedure = resolveProcedureReference(content.procedures, param(route, "id"));
      if (!procedure) return { path: "/manual", title: "Manual SAMUR" };
      return { path: `/manual/${encodeURIComponent(procedure.slug)}`, title: `${procedure.id} · ${procedure.title}` };
    }
    case "Drug": {
      const id = param(route, "id");
      return id ? vademecumWebPath(content, `vademecum:drug:${id}`) : { path: "/vademecum", title: "Vademécum" };
    }
    case "Vademecum":
      return vademecumWebPath(content, param(route, "routeKey"));
    case "Code": {
      const match = /^code:([^:]+):(.+)$/.exec(param(route, "routeKey"));
      if (!match) return { path: "/codigos", title: "Códigos" };
      return { path: codeWebPath(match[1], match[2]), title: codeTitle(content, match[1], match[2]) };
    }
    case "Location": {
      const match = /^location:(hospital|base):([^:]+)$/.exec(param(route, "routeKey"));
      if (!match) return { path: "/mapa", title: "Mapa" };
      const [, kind, id] = match;
      const records = (kind === "hospital" ? content.hospitals : content.bases) as Record<string, unknown>[];
      const name = text(records.find((item) => text(item, "id") === id), "name");
      return { path: withQuery("/mapa", { [kind]: id }), title: name || id };
    }
    default:
      return null;
  }
}

function hostMatches(url: URL, origin: string): boolean {
  return url.protocol === "https:" && url.host === new URL(origin).host;
}

/**
 * Reverse direction: an incoming universal link (or `manualsamur://` deep link with
 * the same path) → the screen to navigate to. Unknown or stale ids fall back to the
 * section root rather than to a "not found" screen.
 */
export function webUrlToAppRoute(rawUrl: string, content: WebRouteContent, origin = WEB_ORIGIN): AppRouteTarget | null {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  let pathname: string;
  if (url.protocol === "manualsamur:") {
    // manualsamur://manual/301-… parses with host "manual"; normalise to a web path.
    pathname = `/${url.host}${url.pathname}`;
  } else if (hostMatches(url, origin)) {
    pathname = url.pathname;
  } else {
    return null;
  }
  pathname = pathname.replace(/\/+$/, "") || "/";
  const query = url.searchParams;

  if (pathname === "/" || pathname === "/manual") return { screen: "Tabs", params: { screen: "Inicio" } };
  const manual = /^\/manual\/([^/]+)$/.exec(pathname);
  if (manual) {
    let slug: string;
    try { slug = decodeURIComponent(manual[1]); } catch { return { screen: "Tabs", params: { screen: "Inicio" } }; }
    const procedure = resolveProcedureReference(content.procedures, slug);
    return procedure ? { screen: "Procedure", params: { id: procedure.id } } : { screen: "Tabs", params: { screen: "Inicio" } };
  }
  if (pathname === "/vademecum") {
    const drugId = query.get("farmaco");
    if (drugId && content.drugs.some((item) => String(item.id) === drugId)) return { screen: "Drug", params: { id: drugId } };
    const perfusionName = query.get("perfusion");
    const perfusion = perfusionName ? content.perfusions.find((item) => text(item, "drug") === perfusionName) : undefined;
    if (perfusion) return { screen: "Vademecum", params: { routeKey: `vademecum:perfusion:${text(perfusion, "id", "drugId", "drug")}` } };
    return { screen: "Tabs", params: { screen: "VademecumList" } };
  }
  if (pathname === "/codigos") {
    const tab = query.get("tab") ?? "";
    const group = tab === "otros" ? query.get("subtab") ?? "" : tab;
    const code = query.get("code");
    if (code && (TOP_CODE_TABS.has(group) || OTROS_CODE_SUBTABS.has(group))) {
      const records = (content.codes[group] ?? []) as Record<string, unknown>[];
      const record = records.find((item) => text(item, "code", "key").toLowerCase() === code.toLowerCase());
      if (record) return { screen: "Code", params: { routeKey: `code:${group}:${text(record, "code", "key")}` } };
    }
    return { screen: "Tabs", params: { screen: "Codigos" } };
  }
  if (pathname === "/mapa") {
    for (const kind of ["hospital", "base"] as const) {
      const id = query.get(kind);
      const records = (kind === "hospital" ? content.hospitals : content.bases) as Record<string, unknown>[];
      if (id && records.some((item) => text(item, "id") === id)) return { screen: "Location", params: { routeKey: `location:${kind}:${id}` } };
    }
    return { screen: "Tabs", params: { screen: "Mapa" } };
  }
  if (pathname === "/abreviaturas") return { screen: "Abbreviations" };
  if (pathname === "/cambios") return { screen: "Historial" };
  return null;
}
