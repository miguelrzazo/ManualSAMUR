# Synthetic field-validation checklist

This checklist is for a human owner using synthetic, non-patient data only. Never enter, paste, photograph, export, log, or retain protected health information (PHI), personally identifying information, real patient identifiers, real case numbers, addresses, dates of birth, phone numbers, or clinical narratives from a live incident.

Use values such as `TEST-PATIENT-001` only where a field is unavoidable; this is a navigation fixture, not a patient record. Delete test state after the pass.

- [ ] Record the approved iPhone and Android reference model/OS and the evidence build/package hashes.
- [ ] Launch with network disabled; confirm the disclosure, Inicio, Buscar, Procedures, Vademécum and Codes remain usable.
- [ ] Search known procedure IDs/titles, medicine names, codes and abbreviations; open each resolved detail.
- [ ] Add and remove synthetic Favorites for a procedure, medicine, code, base and hospital; verify Guardados ordering.
- [ ] Open successful details and verify Recents ordering; attempt malformed/stale routes and confirm they never become successful history.
- [ ] Exercise an attachment that is bundled, an optional verified download, a failed download, and an unavailable official source without claiming availability.
- [ ] Simulate a failed or interrupted update; verify the last-known-good package remains active and recovery is explicit.
- [ ] Test VoiceOver/TalkBack, Dynamic Type/large text, reduced motion, contrast, focus order, labels, and touch targets.
- [ ] Deny location permission; confirm the offline directory and accessible schematic remain available.
- [ ] Capture only synthetic screenshots and measurements; do not include PHI in screenshots, logs, crash reports, filenames, or handoff notes.
- [ ] Have the owner sign and date the checklist outside the app evidence generator.
