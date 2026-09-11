import { buildMobileContentSnapshot } from "@/lib/mobile-snapshot";

export const dynamic = "force-static";

export async function GET() {
  const snapshot = buildMobileContentSnapshot();
  return Response.json(
    {
      schema: snapshot.schema,
      version: snapshot.version,
      hash: snapshot.hash,
      packageHash: snapshot.packageHash,
      generatedAt: snapshot.generatedAt,
      contentUrl: "/api/mobile/content/v3",
    },
    { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } },
  );
}
