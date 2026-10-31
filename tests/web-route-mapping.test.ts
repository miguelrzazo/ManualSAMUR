import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildMobileContentSnapshot } from "../lib/mobile-snapshot.ts";
import { getProcedureNavMeta } from "../lib/content.ts";
import {
  APPLE_APP_ID,
  HANDOFF_ACTIVITY_TYPE,
  UNIVERSAL_LINK_EXCLUDED_PATHS,
  UNIVERSAL_LINK_PATHS,
  WEB_ORIGIN,
  appRouteToWebActivity,
  appRouteToWebPath,
  webUrlToAppRoute,
  type AppRouteTarget,
  type FocusedRoute,
} from "../apps/mobile/src/web-route-mapping.ts";

const content = buildMobileContentSnapshot(process.cwd(), "2026-01-01T00:00:00.000Z").content;

/** An AppRouteTarget is exactly what React Navigation reports back once it is focused. */
function focused(target: AppRouteTarget): FocusedRoute {
  if (target.screen === "Tabs") return { name: target.params.screen };
  return { name: target.screen, params: "params" in target ? target.params : undefined };
}

function roundTrip(route: FocusedRoute): AppRouteTarget | null {
  const activity = appRouteToWebActivity(route, content);
  assert.ok(activity, `${route.name} has a web URL`);
  return webUrlToAppRoute(activity.url, content);
}

test("every procedure in the corpus maps to its real web page and back", () => {
  const webSlugs = new Set(getProcedureNavMeta().map((procedure) => procedure.slug));
  assert.ok(content.procedures.length > 200);
  for (const procedure of content.procedures) {
    const activity = appRouteToWebActivity({ name: "Procedure", params: { id: procedure.id } }, content);
    assert.ok(activity);
    const url = new URL(activity.url);
    assert.equal(url.origin, WEB_ORIGIN);
    const slug = decodeURIComponent(url.pathname.replace(/^\/manual\//, ""));
    assert.ok(webSlugs.has(slug), `${procedure.id} → /manual/${slug} is a statically exported page`);
    assert.ok(activity.title.startsWith(procedure.id));
    assert.deepEqual(webUrlToAppRoute(activity.url, content), { screen: "Procedure", params: { id: procedure.id } });
  }
});

test("known procedure URL matches the web route", () => {
  assert.equal(appRouteToWebActivity({ name: "Procedure", params: { id: "301" } }, content)?.url, `${WEB_ORIGIN}/manual/301-parada-cardiorrespiratoria`);
  assert.deepEqual(webUrlToAppRoute(`${WEB_ORIGIN}/manual/301-parada-cardiorrespiratoria/`, content), { screen: "Procedure", params: { id: "301" } });
});

test("every drug round-trips through /vademecum?farmaco=", () => {
  for (const drug of content.drugs) {
    const id = String(drug.id);
    const activity = appRouteToWebActivity({ name: "Drug", params: { id } }, content);
    assert.equal(activity?.url, `${WEB_ORIGIN}/vademecum?farmaco=${encodeURIComponent(id)}`);
    assert.deepEqual(roundTrip({ name: "Drug", params: { id } }), { screen: "Drug", params: { id } });
    // The reference screen for the same drug lands on the dedicated drug screen.
    assert.deepEqual(roundTrip({ name: "Vademecum", params: { routeKey: `vademecum:drug:${id}` } }), { screen: "Drug", params: { id } });
  }
});

test("every perfusion round-trips through /vademecum?perfusion=<drug name>", () => {
  assert.ok(content.perfusions.length > 0);
  for (const perfusion of content.perfusions) {
    const routeKey = `vademecum:perfusion:${String(perfusion.id)}`;
    const path = appRouteToWebPath({ name: "Vademecum", params: { routeKey } }, content)?.path;
    assert.equal(path, `/vademecum?perfusion=${new URLSearchParams({ x: String(perfusion.drug) }).toString().slice(2)}`);
    assert.deepEqual(roundTrip({ name: "Vademecum", params: { routeKey } }), { screen: "Vademecum", params: { routeKey } });
  }
});

test("every code in a web-visible group round-trips through /codigos", () => {
  let checked = 0;
  for (const [group, records] of Object.entries(content.codes)) {
    for (const record of records as Record<string, unknown>[]) {
      const code = typeof record.code === "string" ? record.code : "";
      if (!code) continue;
      const routeKey = `code:${group}:${code}`;
      const url = new URL(appRouteToWebActivity({ name: "Code", params: { routeKey } }, content)!.url);
      assert.equal(url.pathname, "/codigos");
      if (["icao", "indicativos", "claves", "lima"].includes(group)) {
        assert.equal(url.searchParams.get("tab"), "otros");
        assert.equal(url.searchParams.get("subtab"), group);
      } else {
        assert.equal(url.searchParams.get("tab"), group);
      }
      assert.equal(url.searchParams.get("code"), code);
      const back = webUrlToAppRoute(url.toString(), content);
      // Duplicate codes inside one group resolve to the first entry, which is the
      // same row the web highlights.
      assert.equal(back?.screen, "Code");
      checked += 1;
    }
  }
  assert.ok(checked > 500, `checked ${checked} codes`);
  assert.equal(appRouteToWebPath({ name: "Code", params: { routeKey: "code:sva:A.0.0" } }, content)?.path, "/codigos?tab=sva&code=A.0.0");
});

test("every hospital and base round-trips through /mapa", () => {
  for (const [kind, records] of [["hospital", content.hospitals], ["base", content.bases]] as const) {
    assert.ok(records.length > 0);
    for (const record of records) {
      const routeKey = `location:${kind}:${String(record.id)}`;
      assert.equal(appRouteToWebPath({ name: "Location", params: { routeKey } }, content)?.path, `/mapa?${kind}=${encodeURIComponent(String(record.id))}`);
      assert.deepEqual(roundTrip({ name: "Location", params: { routeKey } }), { screen: "Location", params: { routeKey } });
    }
  }
});

test("section roots map both ways", () => {
  const roots: Array<[AppRouteTarget, string]> = [
    [{ screen: "Tabs", params: { screen: "Inicio" } }, "/manual"],
    [{ screen: "Tabs", params: { screen: "VademecumList" } }, "/vademecum"],
    [{ screen: "Tabs", params: { screen: "Codigos" } }, "/codigos"],
    [{ screen: "Tabs", params: { screen: "Mapa" } }, "/mapa"],
    [{ screen: "Abbreviations" }, "/abreviaturas"],
    [{ screen: "Historial" }, "/cambios"],
  ];
  for (const [target, webPath] of roots) {
    assert.equal(appRouteToWebPath(focused(target), content)?.path, webPath);
    assert.deepEqual(webUrlToAppRoute(`${WEB_ORIGIN}${webPath}`, content), target);
    assert.ok(existsSync(path.join("app", webPath.slice(1), "page.tsx")), `${webPath} is a real web route`);
  }
  assert.equal(appRouteToWebPath({ name: "Buscar" }, content)?.path, "/manual");
  assert.deepEqual(webUrlToAppRoute(`${WEB_ORIGIN}/`, content), { screen: "Tabs", params: { screen: "Inicio" } });
});

test("unknown ids fall back to the section root; foreign and excluded URLs are ignored", () => {
  assert.deepEqual(webUrlToAppRoute(`${WEB_ORIGIN}/manual/no-existe`, content), { screen: "Tabs", params: { screen: "Inicio" } });
  assert.deepEqual(webUrlToAppRoute(`${WEB_ORIGIN}/vademecum?farmaco=no-existe`, content), { screen: "Tabs", params: { screen: "VademecumList" } });
  assert.deepEqual(webUrlToAppRoute(`${WEB_ORIGIN}/codigos?tab=sva&code=Z.9.9`, content), { screen: "Tabs", params: { screen: "Codigos" } });
  assert.deepEqual(webUrlToAppRoute(`${WEB_ORIGIN}/mapa?hospital=nope`, content), { screen: "Tabs", params: { screen: "Mapa" } });
  assert.equal(webUrlToAppRoute(`${WEB_ORIGIN}/gestion-editorial`, content), null);
  assert.equal(webUrlToAppRoute(`${WEB_ORIGIN}/api/health`, content), null);
  assert.equal(webUrlToAppRoute("https://example.com/manual/301-parada-cardiorrespiratoria", content), null);
  assert.equal(webUrlToAppRoute("http://manualsamur.miguelrzazo13.workers.dev/manual", content), null);
  assert.equal(webUrlToAppRoute("not a url", content), null);
  assert.equal(appRouteToWebPath({ name: "Changelog" }, content), null);
  assert.equal(appRouteToWebPath({ name: "Anexo", params: { attachmentId: "x" } }, content), null);
});

test("manualsamur:// deep links share the same reverse mapping", () => {
  assert.deepEqual(webUrlToAppRoute("manualsamur://manual/301-parada-cardiorrespiratoria", content), { screen: "Procedure", params: { id: "301" } });
  assert.deepEqual(webUrlToAppRoute("manualsamur://vademecum?farmaco=adrenalina", content), { screen: "Drug", params: { id: "adrenalina" } });
});

test("published apple-app-site-association claims exactly the mapped paths", () => {
  const aasa = JSON.parse(readFileSync("public/.well-known/apple-app-site-association", "utf8"));
  const [details] = aasa.applinks.details;
  assert.deepEqual(details.appIDs, [APPLE_APP_ID]);
  const excluded = details.components.filter((component: { exclude?: boolean }) => component.exclude).map((component: { "/": string }) => component["/"]);
  const included = details.components.filter((component: { exclude?: boolean }) => !component.exclude).map((component: { "/": string }) => component["/"]);
  assert.deepEqual(excluded, [...UNIVERSAL_LINK_EXCLUDED_PATHS]);
  assert.deepEqual(included, [...UNIVERSAL_LINK_PATHS]);
  // Exclusions must precede inclusions: iOS stops at the first matching component.
  assert.ok(details.components.findIndex((component: { exclude?: boolean }) => !component.exclude) > excluded.length - 1);
  assert.deepEqual(aasa.activitycontinuation.apps, [APPLE_APP_ID]);
  // Every claimed path resolves to a screen.
  for (const claimed of UNIVERSAL_LINK_PATHS) {
    const sample = claimed.replace("*", "301-parada-cardiorrespiratoria");
    assert.ok(webUrlToAppRoute(`${WEB_ORIGIN}${sample}`, content), `${sample} routes in the app`);
  }
});

test("Cloudflare serves the association file as JSON", () => {
  const headers = readFileSync("public/_headers", "utf8");
  assert.match(headers, /^\/\.well-known\/apple-app-site-association\n\s+Content-Type: application\/json$/m);
});

test("the app config, the mapping and the content origin agree on one domain", () => {
  const { expo } = JSON.parse(readFileSync("apps/mobile/app.json", "utf8"));
  const host = new URL(WEB_ORIGIN).host;
  assert.equal(expo.extra.manualContentOrigin, WEB_ORIGIN);
  assert.deepEqual(expo.ios.associatedDomains, [`applinks:${host}`, `activitycontinuation:${host}`]);
  assert.ok(expo.ios.infoPlist.NSUserActivityTypes.includes(HANDOFF_ACTIVITY_TYPE));
  assert.equal(`FC8DH72682.${expo.ios.bundleIdentifier}`, APPLE_APP_ID);
});
