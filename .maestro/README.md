# Mobile UI flows

These flows exercise the bundled mobile content on a phone-sized iOS simulator or Android emulator.

Prerequisites:

- Build and install the app with `npm --prefix apps/mobile run ios` or `npm --prefix apps/mobile run android`.
- Install the Maestro CLI and have the target simulator/emulator running.
- The flow uses the app's bundled snapshot; it does not need the web app or a mock API.

Run:

```bash
maestro test .maestro/procedure-tables.yaml
maestro test .maestro/scroll-chrome.yaml
```

`procedure-tables.yaml` opens procedures `304_02` and `314_06`, checks representative cells, verifies that raw Markdown table syntax is not displayed, and swipes through a horizontally scrollable clinical table.

`scroll-chrome.yaml` covers the scroll behaviour of the list destinations and the
procedure reader: the large header folds into a compact bar on a downward
scroll and returns via the back-to-top control, the TETRA / informe-asistencial annotations sit at the foot
of the Códigos list rather than above it, the Vademécum A-Z index highlights the
letter in view, the global search rows lead with a kind icon and explain body
matches with a highlighted excerpt, and the procedure title hands off to the
navigation bar. It also writes the screenshots used as evidence on those issues.

Note on swipes: both flows use explicit `start`/`end` percentages rather than
`direction: UP`. Maestro's directional swipe starts at the vertical centre and
ends near the bottom bar, which on these layouts barely moves a list.
