"use client";

// lib/use-generation-stream.ts — the client SSE consumer for the generation
// engine (card-011). One module owns BOTH ways a client talks to the two
// generation routes, sharing a single SSE frame parser:
//
//   (a) startGeneration(body)  — opens a POST stream to
//       /api/briefings/generate, reads the new briefing id from the
//       X-Briefing-Id response header (the engine sets it before any event),
//       and returns the id. The run persists every event server-side, so the
//       caller can navigate straight to the generation surface, which resumes
//       via (b). A non-2xx is parsed into a human error and NEVER rendered as
//       empty success (constitution rule 9).
//
//   (b) useGenerationStream(briefingId) — attaches to
//       /api/briefings/[id]/events, which REPLAYS the persisted log then TAILS
//       live rows until the run completes or fails. This is what makes both a
//       freshly-created run and a reopened GENERATING card resume identically.
//       The fetch aborts on unmount (rule 9) — but the run keeps going
//       server-side (that is the whole promise of rule 8), so reconnecting
//       replays everything and picks the tail back up.
//
// The engine emits each `text_delta` as its own persisted row; this hook
// concatenates them into `streamedText` (the live body) and keeps every
// status/thinking/tool_call event as a timeline `line`. `stepCount` counts the
// meaningful (non-text) steps; the engine advertises no fixed total, so
// `totalSteps` is null until the run ends (then it equals the steps that
// actually ran) — see the surface's honest progress treatment.
import { useEffect, useState } from "react";
import type {
  GenerateRequest,
  GenerationEventKind,
  StreamMessage,
} from "@/lib/briefing-types";

// ---------------------------------------------------------------------------
// Shape the surface consumes
// ---------------------------------------------------------------------------

export type LogLine = {
  /** generation_events.id when persisted; a synthetic key otherwise. */
  id: number | string;
  kind: Exclude<GenerationEventKind, "text_delta">;
  content: string;
  /** ISO timestamp the row was created (drives the mono time + elapsed). */
  at: string;
};

export type StreamStatus = "connecting" | "generating" | "complete" | "failed";

export type GenerationStream = {
  /** The activity log: every status/thinking/tool_call event, in order. */
  lines: LogLine[];
  /** The briefing body streaming in, assembled from text_delta events. */
  streamedText: string;
  status: StreamStatus;
  /** Meaningful steps seen so far (status/thinking/tool_call events). */
  stepCount: number;
  /** Only known once the run ends (= the steps that ran); null while live. */
  totalSteps: number | null;
  /** Human-readable failure detail once the run fails; null otherwise. */
  error: string | null;
  /** Earliest / latest event timestamp — a truthful elapsed, view-independent. */
  firstAt: string | null;
  lastAt: string | null;
};

function initialStream(status: StreamStatus): GenerationStream {
  return {
    lines: [],
    streamedText: "",
    status,
    stepCount: 0,
    totalSteps: null,
    error: null,
    firstAt: null,
    lastAt: null,
  };
}

// ---------------------------------------------------------------------------
// The shared SSE frame parser. Both routes speak `data: <json>\n\n` frames
// (StreamMessage). We buffer across chunk boundaries, split on the blank line
// that terminates each frame, and JSON-parse the `data:` payload. Non-data
// lines (comments / keep-alives) are ignored rather than mistaken for an event.
// ---------------------------------------------------------------------------

async function readSse(
  body: ReadableStream<Uint8Array>,
  onMessage: (message: StreamMessage) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data === "") continue;
        try {
          onMessage(JSON.parse(data) as StreamMessage);
        } catch {
          // A malformed / partial frame is skipped, never shown as an event.
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // reader already released (aborted mid-read); nothing to do.
    }
  }
}

// Fold one SSE message into the accumulated stream state.
function reduce(prev: GenerationStream, m: StreamMessage): GenerationStream {
  if (m.type === "event") {
    const live: StreamStatus =
      prev.status === "connecting" ? "generating" : prev.status;
    const firstAt = prev.firstAt ?? m.at;
    if (m.kind === "text_delta") {
      return {
        ...prev,
        status: live,
        streamedText: prev.streamedText + m.content,
        firstAt,
        lastAt: m.at,
      };
    }
    return {
      ...prev,
      status: live,
      lines: [
        ...prev.lines,
        {
          id: m.id ?? `${m.kind}-${prev.lines.length}`,
          kind: m.kind,
          content: m.content,
          at: m.at,
        },
      ],
      stepCount: prev.stepCount + 1,
      firstAt,
      lastAt: m.at,
    };
  }
  // Terminal marker: freeze the status, lock the step total, carry the error.
  return {
    ...prev,
    status: m.status,
    totalSteps: prev.stepCount,
    error: m.error,
  };
}

const CONNECTION_LOST =
  "The connection to the run dropped. Nothing was lost — reopen to resume.";

// ---------------------------------------------------------------------------
// (a) START — open the POST stream, return the new briefing id.
// ---------------------------------------------------------------------------

export type StartResult = { id: string } | { error: string };

export async function startGeneration(
  body: GenerateRequest,
  signal?: AbortSignal
): Promise<StartResult> {
  let res: Response;
  try {
    res = await fetch("/api/briefings/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    return { error: "Couldn't reach the server to start the briefing." };
  }

  // Rule 9: a non-2xx is a real failure, surfaced — never an empty success.
  if (!res.ok) {
    let detail = `The server refused the request (${res.status}).`;
    try {
      const parsed = (await res.json()) as { error?: string };
      if (parsed?.error) detail = parsed.error;
    } catch {
      // Non-JSON error body; keep the status-code message.
    }
    return { error: detail };
  }

  const id = res.headers.get("X-Briefing-Id");
  if (!id) {
    return {
      error: "The briefing started but its id never arrived. Reload and check.",
    };
  }

  // We do not consume the body: the engine persists every event regardless of
  // this stream (the generate route's cancel() deliberately keeps the run
  // alive), and the caller resumes through the events route. Release the
  // reader so the socket can close on our side.
  try {
    void res.body?.cancel();
  } catch {
    // Body already settled; the run is unaffected.
  }
  return { id };
}

// ---------------------------------------------------------------------------
// (b) ATTACH — the hook. Replay + tail an existing briefing's run.
// ---------------------------------------------------------------------------

export function useGenerationStream(briefingId: string): GenerationStream {
  const [stream, setStream] = useState<GenerationStream>(() =>
    initialStream("connecting")
  );

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    // No synchronous reset here: the surface mounts this hook keyed by
    // briefingId (app/briefings/[id]/generating), so a new id remounts with a
    // fresh "connecting" state from the initializer — matching the codebase's
    // key-per-id pattern and keeping the effect free of cascading setState.
    (async () => {
      let res: Response;
      try {
        res = await fetch(`/api/briefings/${briefingId}/events`, {
          headers: { Accept: "text/event-stream" },
          signal,
        });
      } catch {
        if (!signal.aborted) {
          setStream((s) => ({ ...s, status: "failed", error: CONNECTION_LOST }));
        }
        return;
      }

      // Rule 9: 401/404/500 become an honest failure, not a blank "no data".
      if (!res.ok || !res.body) {
        let detail = CONNECTION_LOST;
        try {
          const parsed = (await res.json()) as { error?: string };
          if (parsed?.error) detail = parsed.error;
        } catch {
          if (res.status === 404) detail = "This briefing doesn't exist.";
        }
        if (!signal.aborted) {
          setStream((s) => ({ ...s, status: "failed", error: detail }));
        }
        return;
      }

      await readSse(
        res.body,
        (message) => {
          if (!signal.aborted) setStream((prev) => reduce(prev, message));
        },
        signal
      );

      // The stream closed without a terminal marker while we still thought it
      // was live: the tail deadline elapsed or the socket dropped. Say so
      // rather than leaving a forever-spinning "generating" (rule 8/9).
      if (!signal.aborted) {
        setStream((s) =>
          s.status === "connecting" || s.status === "generating"
            ? { ...s, status: "failed", error: CONNECTION_LOST }
            : s
        );
      }
    })();

    // Rule 9: abort on unmount. The server run continues (rule 8) and a later
    // mount replays it from the DB, so nothing is lost by leaving.
    return () => controller.abort();
  }, [briefingId]);

  return stream;
}
