import { getAIService } from "@/ai/server/instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports which provider is active. Contains no secrets: never the key, only whether one exists. */
export async function GET() {
  return Response.json(getAIService().status(), { headers: { "Cache-Control": "no-store" } });
}
