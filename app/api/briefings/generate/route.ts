// POST /api/briefings/generate — the generation engine's front door (card-010).
//
// Body: { documentIds: string[], title?: string, model? }.
//   - Auth required (401 JSON; middleware lets /api through WITHOUT the sign-in
//     redirect precisely so this route can answer machine-readable JSON).
//   - Validates: at least one document, every document is in the caller's org
//     (RLS makes a cross-org id return nothing → treated as 400, never a leak),
//     and the model is on the server allowlist (the client string is never
//     trusted blindly — DESIGN-SPEC §5 D1).
//   - Creates the briefing (status 'generating') + its briefing_sources + the
//     opening audit lines, then runs generation, PERSISTING every
//     generation_events row as it happens so the run survives the client
//     closing (rule 8). The response is a live SSE stream forwarding the same
//     events. All DB access is the signed-in user's session (RLS) — never the
//     service-role key.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  prepareGeneration,
  runGeneration,
  type SseSink,
} from "@/lib/ai/generation";
import type { GenerateRequest, StreamMessage } from "@/lib/briefing-types";

// The model loop uses the Node runtime (streaming SDK, long-lived request).
export const runtime = "nodejs";
// Generation can run for a while; give the function room past the default.
export const maxDuration = 300;

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonError(401, "You need to be signed in to generate a briefing.");
  }

  let payload: GenerateRequest;
  try {
    payload = (await request.json()) as GenerateRequest;
  } catch {
    return jsonError(400, "The request arrived malformed — try again.");
  }

  const prep = await prepareGeneration(
    supabase,
    { id: user.id, email: user.email },
    payload
  );
  if ("failure" in prep) {
    return jsonError(prep.failure.status, prep.failure.error);
  }
  const prepared = prep.prepared;

  // Stream the run as Server-Sent Events. runGeneration persists every event
  // to the DB regardless of this stream, so if the client disconnects the run
  // keeps going and the events route can replay/tail it.
  const encoder = new TextEncoder();
  let controllerClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sink: SseSink = (message: StreamMessage) => {
        // Throwing here (client gone) is caught inside runGeneration, which
        // then stops forwarding but keeps persisting.
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(message)}\n\n`)
        );
      };

      await runGeneration(supabase, prepared, sink);

      if (!controllerClosed) {
        controllerClosed = true;
        controller.close();
      }
    },
    cancel() {
      // The client disconnected. We DELIBERATELY do not abort the run:
      // runGeneration is persisting to the DB, so the briefing keeps
      // generating and /api/briefings/[id]/events can resume it on reopen.
      controllerClosed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering so events flush immediately.
      "X-Accel-Buffering": "no",
      // The client learns the new briefing's id immediately, before any event.
      "X-Briefing-Id": prepared.briefingId,
    },
  });
}
