import { buildMobileContentSnapshot } from "@/lib/mobile-snapshot";

/**
 * Static export of the current v3 publication. The metadata route and this
 * route are built from the same snapshot so a deployment cannot mix identities.
 */
export const dynamic = "force-static";

export async function GET() {
  return Response.json(buildMobileContentSnapshot(), {
    headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
  });
}
