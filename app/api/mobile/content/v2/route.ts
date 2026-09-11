import { buildMobileContentSnapshot } from "@/lib/mobile-snapshot";

/** Compatibility alias for already-installed clients. New clients use /v3. */
export const dynamic = "force-static";

export async function GET() {
  return Response.json(buildMobileContentSnapshot(), {
    headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
  });
}
