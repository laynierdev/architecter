import { handleAiRequest } from "@/ai/server/handler";
import { getAIGuard, getAIService } from "@/ai/server/instance";

// The Gemini SDK needs Node APIs, and every answer depends on the request.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ task: string }> }) {
  const { task } = await context.params;
  return handleAiRequest(task, request, getAIService(), getAIGuard());
}
