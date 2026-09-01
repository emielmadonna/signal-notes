// GET /api/briefings/[id]/events — SSE replay + live tail (card-010).
//
// This is what lets a reopened generation view RESUME: it (a) replays the
// briefing's persisted generation_events rows in order, then (b) if the
// briefing is still 'generating', TAILS new rows until it completes or fails.
//
// Tailing approach: the generate route persists each event as its own row with
// a monotonic bigint id, so tailing is a simple poll — every second, select
// rows with id greater than the last one seen, forward them, and re-check the
// briefing's status. Polling (rather than LISTEN/NOTIFY or Realtime) is chosen
// deliberately: it needs no extra connection, works through the same RLS user
// session, and the event volume per briefing is small. Auth is required and
// every read is org-scoped by RLS (a cross-org id simply returns nothing → 404).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { internalError } from "@/lib/errors";
import type { GenerationEventKind, StreamMessage } from "@/lib/briefing-types";

export const runtime = "nodejs";
export const maxDuration = 300;

const POLL_INTERVAL_MS = 1000;
const TAIL_DEADLINE_MS = 285_000; // stop tailing before the function times out

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

type EventRow = {
  id: number;
  kind: GenerationEventKind;
  content: string;
  created_at: string;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonError(401, "You need to be signed in to watch a briefing.");
  }

  // Org-scoped by RLS: a briefing in another org (or a bad id) returns nothing.
  const { data: briefing, error: briefingError } = await supabase
    .from("briefings")
    .select("id, status, word_count, citation_count")
    .eq("id", id)
    .maybeSingle();
  if (briefingError) {
    return jsonError(
      500,
      internalError(
        "We couldn't load that briefing.",
        "events: briefing lookup failed",
        briefingError
      )
    );
  }
  if (!briefing) {
    return jsonError(404, "This briefing doesn't exist.");
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (message: StreamMessage): boolean => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(message)}\n\n`)
          );
          return true;
        } catch {
          closed = true; // client disconnected
          return false;
        }
      };
      const finish = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            closed = true; // already closed
          }
        }
      };
      const doneFor = (
        status: string,
        wordCount: number | null,
        citationCount: number | null
      ): StreamMessage => ({
        type: "done",
        briefingId: id,
        status: status === "complete" ? "complete" : "failed",
        wordCount,
        citationCount,
        error: status === "failed" ? "This briefing didn't finish." : null,
      });

      // (a) Replay everything persisted so far, in order.
      let lastId = 0;
      const { data: rows, error: rowsError } = await supabase
        .from("generation_events")
        .select("id, kind, content, created_at")
        .eq("briefing_id", id)
        .order("id", { ascending: true });
      if (rowsError) {
        send({
          type: "done",
          briefingId: id,
          status: "failed",
          wordCount: null,
          citationCount: null,
          error: internalError(
            "Could not load the activity log.",
            "events: activity log read failed",
            rowsError
          ),
        });
        finish();
        return;
      }
      for (const raw of (rows ?? []) as EventRow[]) {
        lastId = raw.id;
        if (
          !send({
            type: "event",
            id: raw.id,
            kind: raw.kind,
            content: raw.content,
            at: raw.created_at,
          })
        ) {
          break;
        }
      }

      // If the run already finished, send the terminal marker and close.
      if (briefing.status !== "generating") {
        send(
          doneFor(
            briefing.status as string,
            briefing.word_count as number | null,
            briefing.citation_count as number | null
          )
        );
        finish();
        return;
      }

      // (b) Tail: poll for new rows and status until done or the deadline.
      const deadline = Date.now() + TAIL_DEADLINE_MS;
      while (!closed && !request.signal.aborted && Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);

        const { data: newRows, error: pollError } = await supabase
          .from("generation_events")
          .select("id, kind, content, created_at")
          .eq("briefing_id", id)
          .gt("id", lastId)
          .order("id", { ascending: true });
        if (pollError) {
          send({
            type: "done",
            briefingId: id,
            status: "failed",
            wordCount: null,
            citationCount: null,
            error: internalError(
              "The activity log became unreadable.",
              "events: activity log poll failed",
              pollError
            ),
          });
          break;
        }
        for (const raw of (newRows ?? []) as EventRow[]) {
          lastId = raw.id;
          send({
            type: "event",
            id: raw.id,
            kind: raw.kind,
            content: raw.content,
            at: raw.created_at,
          });
        }

        const { data: status, error: statusError } = await supabase
          .from("briefings")
          .select("status, word_count, citation_count")
          .eq("id", id)
          .maybeSingle();
        if (statusError || !status) {
          // Transient read miss; keep tailing rather than declaring failure.
          continue;
        }
        if (status.status !== "generating") {
          send(
            doneFor(
              status.status as string,
              status.word_count as number | null,
              status.citation_count as number | null
            )
          );
          break;
        }
      }
      finish();
    },
    cancel() {
      closed = true; // client left; stop tailing
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
