import { buildMobileContentSnapshot } from "@/lib/mobile-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = buildMobileContentSnapshot();
  return Response.json(
    {
      schema: snapshot.schema,
      version: snapshot.version,
      hash: snapshot.hash,
      packageHash: snapshot.packageHash,
      generatedAt: snapshot.generatedAt,
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
