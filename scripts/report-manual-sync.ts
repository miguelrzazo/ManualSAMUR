import fs from "node:fs";

const status = process.env.SYNC_OUTCOME || "unknown";
console.log("# ManualSAMUR monthly official update report\n");
console.log(`Generated: ${new Date().toISOString()}`);
console.log(`Extraction: ${status}`);
console.log(`Validation: ${process.env.VALIDATION_OUTCOME || "not run"}`);
console.log(`Backend proposals: ${process.env.PROPOSAL_OUTCOME || "not run"}\n`);
console.log("Official changes require editorial review before publication.\n");
if (status === "success") {
  const sync = JSON.parse(fs.readFileSync("content/data/manual-sync.json", "utf8"));
  console.log(`Detected manual edition: ${sync.manualVersionCurrent || sync.manualVersion || "unknown"}\n`);
  const run = sync.runs?.[0];
  if (run) {
    console.log("## Domain summary\n");
    for (const [domain, summary] of Object.entries(run.summary || {})) {
      console.log(`- ${domain}: ${JSON.stringify(summary)}`);
    }
    console.log("\n## Proposed changes\n");
    for (const [domain, changes] of Object.entries(run.changes || {})) {
      for (const change of changes as Array<{ changeType: string; id: string; title?: string }>) {
        if (change.changeType !== "unchanged") console.log(`- ${domain}: ${change.changeType} ${change.id} ${change.title || ""}`);
      }
    }
    if (run.attachmentFailures?.length) {
      console.log("\n## Unavailable upstream attachments\n");
      for (const asset of run.attachmentFailures) console.log(`- ${asset.sourceUrl}: ${asset.error}`);
    }
  }
} else {
  console.log("The extraction did not complete. Checkout content remains at the previous snapshot; inspect sync.log for the failing URL or validation guard.\n");
}
