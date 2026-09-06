# Mobile procedure-table flows

These flows exercise the bundled mobile content on a phone-sized iOS simulator or Android emulator.

Prerequisites:

- Build and install the app with `npm --prefix apps/mobile run ios` or `npm --prefix apps/mobile run android`.
- Install the Maestro CLI and have the target simulator/emulator running.
- The flow uses the app's bundled snapshot; it does not need the web app or a mock API.

Run:

```bash
maestro test .maestro/procedure-tables.yaml
```

The flow opens procedures `304_02` and `314_06`, checks representative cells, verifies that raw Markdown table syntax is not displayed, and swipes through a horizontally scrollable clinical table.
