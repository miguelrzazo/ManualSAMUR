import assert from "node:assert/strict";
import test from "node:test";
import { adaptiveLayout } from "../apps/mobile/src/accessibility.ts";
import {
  detailRouteKey,
  focusedTab,
  planSizeTransition,
  sectionToDeselect,
  type DetailRoute,
  type RootStackSnapshot,
} from "../apps/mobile/src/split-view-logic.ts";

const procedure: DetailRoute = { screen: "Procedure", params: { id: "301" } };

function stack(tab: string, pushed: { name: string; params?: object }[] = []): RootStackSnapshot {
  const tabs = ["Inicio", "Codigos", "VademecumList", "Mapa", "Buscar"];
  return {
    index: pushed.length,
    routes: [{ name: "Tabs", state: { index: tabs.indexOf(tab), routes: tabs.map((name) => ({ name })) } }, ...pushed],
  };
}

test("one breakpoint drives the rail and the two panes across devices", () => {
  const cases: [string, number, boolean, boolean][] = [
    ["iPhone portrait", 402, false, false],
    ["iPhone Duo closed", 466, false, false],
    ["iPad Slide Over / one-third Split View", 320, false, false],
    ["iPad half Split View (11 in)", 590, false, false],
    ["iPhone Duo open, portrait", 669, true, false],
    ["iPad mini portrait", 744, true, true],
    ["iPad two-thirds Split View", 780, true, true],
    ["iPhone Duo open, landscape", 951, true, true],
    ["iPad Pro 13 in landscape", 1376, true, true],
  ];
  for (const [label, width, rail, twoPane] of cases) {
    const layout = adaptiveLayout(width, 1);
    assert.equal(layout.isWideLayout, rail, `${label}: rail`);
    assert.equal(layout.isTwoPane, twoPane, `${label}: two panes`);
    if (twoPane) {
      assert.ok(layout.listPaneWidth >= 320 && layout.listPaneWidth <= 400, `${label}: list width ${layout.listPaneWidth}`);
      assert.ok(width - layout.railWidth - layout.listPaneWidth >= 280, `${label}: detail keeps a readable width`);
    }
  }
});

test("focusedTab reads the tab navigator nested in the root stack", () => {
  assert.equal(focusedTab(stack("Codigos")), "Codigos");
  assert.equal(focusedTab({ index: 0, routes: [{ name: "Tabs" }] }), "Inicio");
  assert.equal(focusedTab(undefined), undefined);
});

test("collapsing to narrow pushes the selected detail over its list", () => {
  assert.deepEqual(
    planSizeTransition({ wasTwoPane: true, isTwoPane: false, state: stack("Inicio"), selections: { Inicio: procedure } }),
    { kind: "push", detail: procedure },
  );
  // Nothing selected, a non-split tab, or something already pushed: leave it alone.
  assert.equal(planSizeTransition({ wasTwoPane: true, isTwoPane: false, state: stack("Inicio"), selections: {} }).kind, "none");
  assert.equal(planSizeTransition({ wasTwoPane: true, isTwoPane: false, state: stack("Mapa"), selections: { Inicio: procedure } }).kind, "none");
  assert.equal(planSizeTransition({ wasTwoPane: true, isTwoPane: false, state: stack("Inicio", [{ name: "Historial" }]), selections: { Inicio: procedure } }).kind, "none");
});

test("expanding to wide pops a detail pushed from the same list back into the pane", () => {
  const pushed = stack("Inicio", [{ name: "Procedure", params: { id: "301" } }]);
  assert.equal(planSizeTransition({ wasTwoPane: false, isTwoPane: true, state: pushed, selections: { Inicio: procedure } }).kind, "popToTop");
  // A different procedure on top (opened from a link, or from Buscar) stays pushed.
  const other = stack("Inicio", [{ name: "Procedure", params: { id: "412" } }]);
  assert.equal(planSizeTransition({ wasTwoPane: false, isTwoPane: true, state: other, selections: { Inicio: procedure } }).kind, "none");
  const deep = stack("Inicio", [{ name: "Procedure", params: { id: "301" } }, { name: "Drug", params: { id: "x" } }]);
  assert.equal(planSizeTransition({ wasTwoPane: false, isTwoPane: true, state: deep, selections: { Inicio: procedure } }).kind, "none");
  // No crossing, no move.
  assert.equal(planSizeTransition({ wasTwoPane: true, isTwoPane: true, state: pushed, selections: { Inicio: procedure } }).kind, "none");
});

test("going back on a narrow window forgets that tab's selection", () => {
  assert.equal(sectionToDeselect({ isTwoPane: false, previousIndex: 1, state: stack("VademecumList") }), "VademecumList");
  assert.equal(sectionToDeselect({ isTwoPane: true, previousIndex: 1, state: stack("VademecumList") }), undefined);
  assert.equal(sectionToDeselect({ isTwoPane: false, previousIndex: 0, state: stack("VademecumList") }), undefined);
  assert.equal(sectionToDeselect({ isTwoPane: false, previousIndex: 1, state: stack("Buscar") }), undefined);
});

test("detail keys distinguish screens and params", () => {
  assert.notEqual(detailRouteKey(procedure), detailRouteKey({ screen: "Procedure", params: { id: "302" } }));
  assert.equal(detailRouteKey({ screen: "Status4", params: undefined }), "Status4:null");
});
