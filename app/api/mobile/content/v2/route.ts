import { buildMobileContentSnapshot } from "@/lib/mobile-snapshot";

export const revalidate = 3600;

export async function GET() {
  return Response.json(buildMobileContentSnapshot(), {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
