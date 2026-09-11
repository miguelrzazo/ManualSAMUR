# Coherent content publication and change history

Status: accepted

The content pipeline publishes web content, mobile content, Novedades, and Historial from one coherent publication identity and one canonical change-event ledger. A merged content PR is not considered published until the generated artifacts pass hash/schema validation and the public deployment smoke check; the mobile app activates a validated package atomically, shows recent Novedades locally, and loads its complete Historial online with progressive caching. This keeps editorial approval in the PR, prevents metadata/package drift, preserves a permanent web history without bloating the mobile package, and lets the app retain its last known-good content when offline or when a publication is invalid.
