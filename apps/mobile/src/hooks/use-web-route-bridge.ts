import { createNavigationContainerRef } from "@react-navigation/native";
import { useCallback, useEffect, useRef } from "react";
import { Linking } from "react-native";
import { clearCurrentActivity, getCurrentActivity, setCurrentActivity } from "../../modules/manual-handoff";
import { useContentData } from "../content";
import { handoffRouteSource } from "../handoff-route-source";
import type { RootStackParamList } from "../navigation-types";
import { HANDOFF_ACTIVITY_TYPE, appRouteToWebActivity, webUrlToAppRoute, type AppRouteTarget, type FocusedRoute } from "../web-route-mapping";

/** The cold-launch URL is consumed once per process, not once per navigator mount. */
let initialUrlConsumed = false;

/**
 * Connects the navigator to the web in both directions, using the one mapping in
 * `web-route-mapping.ts`:
 *  - publishes the focused screen as an `NSUserActivity` (Handoff to Safari on the Mac);
 *  - routes incoming universal links (and `manualsamur://` links) to their screen.
 *
 * Lives outside the screens; App.tsx passes its root navigation ref and forwards
 * `onReady` / `onStateChange` from NavigationContainer. On a wide window the detail
 * beside a list lives in a pane with its own NavigationContainer; that pane reports its
 * route through `useDetailPaneHandoff`, and while it holds the slot it wins over the
 * root route (which is then just the list's tab).
 */
type NavigationRef = ReturnType<typeof createNavigationContainerRef<RootStackParamList>>;

export function useWebRouteBridge(navigation: NavigationRef) {

  const { content } = useContentData();
  const contentRef = useRef(content);
  useEffect(() => { contentRef.current = content; }, [content]);
  const pendingUrl = useRef<string | null>(null);
  const lastPublished = useRef<string | null>(null);

  const publish = useCallback(() => {
    const rootRoute = navigation.isReady() ? navigation.getCurrentRoute() : undefined;
    if (!rootRoute && !handoffRouteSource.paneRoute()) return;
    const route = handoffRouteSource.resolve(rootRoute);
    const activity = route ? appRouteToWebActivity(route, contentRef.current) : null;
    const key = activity ? `${activity.url}\n${activity.title}` : null;
    if (key === lastPublished.current) return;
    lastPublished.current = key;
    if (!activity) {
      void clearCurrentActivity();
      return;
    }
    void setCurrentActivity(HANDOFF_ACTIVITY_TYPE, activity.url, activity.title, true).then(async () => {
      if (__DEV__) console.log("[handoff] native activity", JSON.stringify(await getCurrentActivity()));
    }).catch(() => undefined);
  }, [navigation]);

  const open = useCallback((url: string) => {
    if (!navigation.isReady()) {
      pendingUrl.current = url;
      return;
    }
    const target = webUrlToAppRoute(url, contentRef.current);
    if (__DEV__) console.log("[universal-link]", url, "→", JSON.stringify(target));
    if (!target) return;
    navigate(navigation, target);
  }, [navigation]);

  useEffect(() => {
    if (!initialUrlConsumed) {
      initialUrlConsumed = true;
      void Linking.getInitialURL().then((url) => { if (url) open(url); }).catch(() => undefined);
    }
    const subscription = Linking.addEventListener("url", ({ url }) => open(url));
    return () => subscription.remove();
  }, [open]);

  // A detail pane opened, navigated inside, emptied or went away.
  useEffect(() => handoffRouteSource.subscribe(publish), [publish]);

  // A content update can change a slug or a title under the same screen.
  useEffect(() => { lastPublished.current = null; publish(); }, [content, publish]);

  const onReady = useCallback(() => {
    const url = pendingUrl.current;
    pendingUrl.current = null;
    if (url) open(url);
    publish();
  }, [open, publish]);

  return { navigation, onReady, onStateChange: publish };
}

interface PaneNavigationRef {
  isReady(): boolean;
  getCurrentRoute(): FocusedRoute | undefined;
}

/**
 * Advertises the route focused inside a detail pane's independent NavigationContainer.
 * `active` is whether the pane is on screen with a detail (its tab is focused and
 * nothing is pushed over the tabs); while inactive, or once it unmounts, the root route
 * is advertised again. Forward the returned callbacks to the pane's NavigationContainer.
 */
export function useDetailPaneHandoff(paneNavigation: PaneNavigationRef, active: boolean) {
  const claim = useRef<ReturnType<typeof handoffRouteSource.claim> | null>(null);
  const report = useCallback(() => {
    claim.current?.update(paneNavigation.isReady() ? paneNavigation.getCurrentRoute() : undefined);
  }, [paneNavigation]);
  useEffect(() => {
    if (!active) return;
    const current = handoffRouteSource.claim();
    claim.current = current;
    report();
    return () => {
      if (claim.current === current) claim.current = null;
      current.release();
    };
  }, [active, report]);
  return { onReady: report, onStateChange: report };
}

function navigate(navigationRef: NavigationRef, target: AppRouteTarget) {
  // web-route-mapping.ts checks AppRouteTarget against RootStackParamList at compile
  // time; React Navigation's overloads cannot narrow a union of [screen, params] pairs.
  const go = navigationRef.navigate as (screen: string, params?: object) => void;
  go(target.screen, "params" in target ? target.params : undefined);
}
