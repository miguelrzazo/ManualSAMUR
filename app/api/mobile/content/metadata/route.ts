import { buildMobileContentSnapshot } from "@/lib/mobile-snapshot";

export const revalidate = 3600;

export async function GET() {
  const snapshot = buildMobileContentSnapshot();
  return Response.json(
    {
      schema: snapshot.schema,
      version: snapshot.version,
      hash: snapshot.hash,
      generatedAt: snapshot.generatedAt,
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
