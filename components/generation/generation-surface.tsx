"use client";

// THE GENERATION SURFACE (card-011) — DESIGN-SPEC §3 SHEETS/GENERATION, the
// signature screen. Values ported from the canvas isGenSheet block (genBar,
// genChip, genChipRow, lines[], streamBox/streamText/caret, genFoot).
//
// It renders over the app background on its own route and RESUMES any run: the
// live log + the briefing body stream in from /api/briefings/[id]/events
// (replay then tail) via useGenerationStream, so a freshly-created run and a
// reopened GENERATING card look identical. Static metadata (title + the bound
// source documents for the GROUNDED-IN chips, rule 6) comes from one
// RLS-scoped read.
//
// Constitution rules in play:
//   R6  grounding is shown — the bound source documents render as chips.
//   R8  the work narrates itself: a timestamped, tagged, streaming log and a
//       live body — never a bare spinner, in any state.
//   R9  the stream fetch aborts on unmount (the hook), a bad id renders NOT
//       FOUND (not an error dump), and a dropped stream is an honest failure.
//   R10 the terminal state drives real buttons (Try again / Read the briefing)
//       with no fake "done" until the engine says so.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { GhostButton, LinkButton, PrimaryButton } from "@/components/ui-sn/buttons";
import { FileIcon, type FileExt } from "@/components/ui-sn/file-icon";
import { RetryIcon, SparkIcon } from "@/components/ui-sn/icons";
import { MicroFaint, MicroLabel } from "@/components/ui-sn/micro";
import { Sheet, SheetCloseButton } from "@/components/ui-sn/sheet";
import { createClient } from "@/lib/supabase/client";
import {
  useGenerationStream,
  type LogLine,
} from "@/lib/use-generation-stream";
import { describeLine } from "./tags";

const SERIF = "var(--font-literata), Literata, Georgia, serif";
const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

// ---------------------------------------------------------------------------
// Static style objects, hoisted to module scope.
//
// This is the ONLY surface that re-renders on every streamed event (it is the
// sole consumer of useGenerationStream), so each object literal written inline
// in its JSX was reallocated on every one. The objects below are entirely
// constant — literals plus the SERIF/SANS/MONO module constants above — so
// hoisting is a pure identity change: same values, allocated once.
//
// The objects that genuinely depend on props or state are deliberately LEFT
// inline; pretending those are constant would be worse than the allocation.
// ---------------------------------------------------------------------------

const S = {
  div1: { padding: "30px 32px 32px" },
  div2: { fontFamily: SERIF, fontSize: 23 },
  p1: {
              fontSize: 13.5,
              lineHeight: 1.65,
              color: "var(--sn-muted)",
              margin: "9px 0 16px",
            },
  div3: { padding: "22px clamp(20px,3vw,30px) 26px" },
  div4: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          },
  div5: { minWidth: 0 },
  h11: {
                fontFamily: SERIF,
                fontSize: "clamp(20px,2.4vw,24px)",
                fontWeight: 400,
                margin: 0,
                color: "var(--sn-text)",
              },
  microLabel1: { display: "block", marginTop: 9 },
  div6: { display: "flex", gap: 8, alignItems: "center" },
  div7: {
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              margin: "16px 0 0",
              paddingBottom: 16,
              borderBottom: "1px solid var(--sn-soft)",
            },
  span1: {
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid var(--sn-border)",
                  borderRadius: 100,
                  padding: "5px 12px 5px 6px",
                  fontSize: 11.5,
                  color: "var(--sn-muted)",
                },
  div8: {
            minHeight: 280,
            paddingTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          },
  div9: {
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: ".08em",
                color: "var(--sn-faint)",
                animation: "sn-pulse 1.1s ease-in-out infinite",
              },
  div10: {
                border: "1px solid var(--sn-soft)",
                borderRadius: 12,
                padding: "14px 16px",
                background: "var(--sn-input-bg)",
                marginTop: 4,
              },
  microLabel2: { display: "block", marginBottom: 8 },
  div11: {
                  fontFamily: SERIF,
                  fontSize: 14.5,
                  lineHeight: 1.75,
                  color: "var(--sn-text)",
                  whiteSpace: "pre-wrap",
                },
  span2: {
                      color: "var(--sn-accent)",
                      animation: "sn-blink 1s steps(1,end) infinite",
                    },
  div12: {
              display: "flex",
              gap: 14,
              padding: "16px 0 0",
              animation: "sn-line .22s ease both",
            },
  div13: {
                width: 2,
                background: "var(--sn-danger)",
                flex: "none",
                borderRadius: 2,
              },
  div14: {
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "var(--sn-danger)",
                },
  p2: {
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "var(--sn-muted)",
                  margin: "6px 0 0",
                },
  div15: { display: "flex", gap: 10, marginTop: 12 },
  p3: {
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "var(--sn-danger)",
              margin: "14px 0 0",
            },
  div16: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            borderTop: "1px solid var(--sn-soft)",
            marginTop: 16,
            paddingTop: 14,
          },
} as const;


const mix = (color: string, pct: string) =>
  `color-mix(in srgb, ${color} ${pct}, transparent)`;

/** Beat between the engine saying COMPLETE and the reading view taking over. */
const AUTO_OPEN_DELAY_MS = 900;

// ---------------------------------------------------------------------------
// Metadata read (title + source chips). Named columns only (R2); RLS is the
// only org wall (R1) — a cross-org / deleted / mistyped id returns nothing and
// renders the canvas NOT FOUND sheet, never a leak.
// ---------------------------------------------------------------------------

type SourceDoc = { id: string; title: string; ext: string; file_name: string | null };

type BriefingMeta = {
  id: string;
  title: string | null;
  status: string;
  model: string;
  created_at: string;
  sources: SourceDoc[];
};

type MetaState =
  | { state: "loading" }
  | { state: "error"; detail: string }
  | { state: "notfound" }
  | { state: "ready"; meta: BriefingMeta };

type RawSourceRow = {
  document_id: string;
  documents: SourceDoc | SourceDoc[] | null;
};

function one<T>(rel: T | T[] | null): T | null {
  if (rel === null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

// ISO -> "HH:MM:SS" for the mono log timestamps.
function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// One activity-log row (canvas lines[]: wrap / timeStyle / tagStyle / style).
// ---------------------------------------------------------------------------

function LogRow({ line, current }: { line: LogLine; current: boolean }) {
  const tag = describeLine(line);
  const wrap: CSSProperties = {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    animation: "sn-line .24s cubic-bezier(.2,.8,.3,1) both",
    opacity: tag.quiet ? 0.72 : 1,
  };
  const timeStyle: CSSProperties = {
    fontFamily: MONO,
    fontSize: 10.5,
    color: "var(--sn-faint)",
    flex: "none",
    paddingTop: 2,
  };
  const tagStyle: CSSProperties = {
    fontFamily: MONO,
    fontSize: 8.5,
    letterSpacing: ".14em",
    color: tag.color,
    border: `1px solid ${mix(tag.color, "40%")}`,
    borderRadius: 4,
    padding: "2px 6px",
    flex: "none",
    ...(current ? { animation: "sn-pulse 1.1s ease-in-out infinite" } : null),
  };
  const textStyle: CSSProperties = {
    fontFamily: tag.mono ? MONO : SANS,
    fontSize: tag.mono ? 12 : 13,
    lineHeight: 1.55,
    color:
      tag.label === "ERROR"
        ? "var(--sn-danger)"
        : tag.quiet
          ? "var(--sn-faint)"
          : current
            ? "var(--sn-text)"
            : "var(--sn-muted)",
    fontStyle: tag.quiet ? "italic" : "normal",
  };
  return (
    <div style={wrap}>
      <span style={timeStyle}>{clockTime(line.at)}</span>
      <span style={tagStyle}>{tag.label}</span>
      <span style={textStyle}>{line.content}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

export function GenerationSurface({ id }: { id: string }) {
  const router = useRouter();
  const close = useCallback(() => router.push("/"), [router]);

  // --- Static metadata --------------------------------------------------
  const [meta, setMeta] = useState<MetaState>({ state: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const supabase = createClient();

    supabase
      .from("briefings")
      .select(
        "id, title, status, model, created_at, briefing_sources (document_id, documents (id, title, ext, file_name))"
      )
      .eq("id", id)
      .abortSignal(signal)
      .maybeSingle()
      .then(({ data, error }) => {
        if (signal.aborted) return;
        if (error) {
          // A malformed id ("wrong link") can never be fixed by retrying → NOT
          // FOUND; every other read failure is an honest, retryable error (R9).
          if (error.code === "22P02") setMeta({ state: "notfound" });
          else setMeta({ state: "error", detail: error.message });
          return;
        }
        if (data === null) {
          setMeta({ state: "notfound" });
          return;
        }
        const raw = data as unknown as {
          id: string;
          title: string | null;
          status: string;
          model: string;
          created_at: string;
          briefing_sources: RawSourceRow[] | null;
        };
        setMeta({
          state: "ready",
          meta: {
            id: raw.id,
            title: raw.title,
            status: raw.status,
            model: raw.model,
            created_at: raw.created_at,
            sources: (raw.briefing_sources ?? [])
              .map((s) => one(s.documents))
              .filter((d): d is SourceDoc => d !== null),
          },
        });
      });

    return () => controller.abort();
  }, [id]);

  // --- The live run ------------------------------------------------------
  const stream = useGenerationStream(id);
  const running = stream.status === "connecting" || stream.status === "generating";
  const failed = stream.status === "failed";
  const complete = stream.status === "complete";

  // AUTO-OPEN the finished briefing. Waiting on the surface after the engine
  // said "Briefing complete." and then having to notice a button is what made
  // a run that HAD finished feel like one that never did. The short beat lets
  // the COMPLETE chip and the final log line land first, so the hand-off is
  // visible rather than a jump-cut; the Read-the-briefing button below stays
  // for anyone who beats the timer or comes back to a finished run.
  useEffect(() => {
    if (!complete) return;
    const t = setTimeout(
      () => router.replace(`/briefings/${id}`),
      AUTO_OPEN_DELAY_MS
    );
    // Leaving before the beat elapses cancels the hand-off, so a user who
    // closes the surface is never yanked into the reading view afterwards.
    return () => clearTimeout(t);
  }, [complete, id, router]);

  // Elapsed, truthful and view-independent: from the first event's timestamp
  // to the last one (frozen when the run ends), ticking against the wall clock
  // only while it is still live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);
  const elapsed = useMemo(() => {
    if (!stream.firstAt) return 0;
    const start = Date.parse(stream.firstAt);
    const end = running
      ? now
      : stream.lastAt
        ? Date.parse(stream.lastAt)
        : now;
    return Math.max(0, (end - start) / 1000);
  }, [stream.firstAt, stream.lastAt, running, now]);

  // Progress bar. The engine advertises no fixed step total, so while running
  // we grow with the step count toward — but never reaching — full (honest:
  // "moving, not done"); complete fills accent, failure fills danger.
  const progressWidth = failed
    ? "100%"
    : complete
      ? "100%"
      : `${Math.min(92, 8 + stream.stepCount * 9)}%`;
  const progressColor = failed ? "var(--sn-danger)" : "var(--sn-accent)";

  const chipLabel = failed ? "FAILED" : complete ? "COMPLETE" : "GENERATING";
  const chipColor = failed ? "var(--sn-danger)" : "var(--sn-accent)";

  const countLine = failed
    ? `STOPPED AT STEP ${stream.stepCount} · ${elapsed.toFixed(1)}S`
    : complete
      ? `${stream.totalSteps ?? stream.stepCount} STEPS · ${elapsed.toFixed(1)}S`
      : `${stream.stepCount} STEP${stream.stepCount === 1 ? "" : "S"} · ${elapsed.toFixed(1)}S ELAPSED`;

  const title =
    meta.state === "ready" && meta.meta.title?.trim()
      ? meta.meta.title
      : "Untitled briefing";
  const sources = meta.state === "ready" ? meta.meta.sources : [];
  // Sources for a Try-again re-run (fresh briefing, same inputs + model).
  const retryHref = useMemo(() => {
    if (meta.state !== "ready" || meta.meta.sources.length === 0) return "/compose";
    const docs = meta.meta.sources.map((s) => s.id).join(",");
    return `/compose?docs=${docs}&model=${encodeURIComponent(meta.meta.model)}`;
  }, [meta]);

  // The engine writes its own "This briefing didn't finish — <reason>" status
  // line as the last log entry, so the failure block does not repeat the
  // reason; it states the honest consequences and offers the two ways forward.
  const lastLineIndex = stream.lines.length - 1;

  // NOT FOUND — the canvas 460 sheet (same as the document sheet's).
  if (meta.state === "notfound") {
    return (
      <Sheet variant="narrow" onClose={close} aria-label="Page not found">
        <div style={S.div1}>
          <div style={S.div2}>
            This page doesn&apos;t exist.
          </div>
          <p
            style={S.p1}
          >
            It may have been deleted, or the link may be wrong.
          </p>
          <PrimaryButton type="button" onClick={close}>
            Back to briefings
          </PrimaryButton>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet variant="default" onClose={close} aria-label={`Generating ${title}`}>
      {/* Top progress bar (canvas genBar): accent width from steps; danger
          full on fail. It is the first, unpadded child so it hugs the sheet's
          rounded top. */}
      <div
        style={{
          height: 3,
          borderRadius: "16px 16px 0 0",
          background: progressColor,
          width: progressWidth,
          transition: "width .6s cubic-bezier(.3,.9,.3,1),background .3s",
        }}
      />
      <div style={S.div3}>
        {/* Title · count/elapsed · status chip · close */}
        <div
          style={S.div4}
        >
          <div style={S.div5}>
            <h1
              style={S.h11}
            >
              {meta.state === "loading" ? "Starting the briefing…" : title}
            </h1>
            <MicroLabel style={S.microLabel1}>
              {countLine}
            </MicroLabel>
          </div>
          <div style={S.div6}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: ".14em",
                padding: "5px 11px",
                borderRadius: 100,
                border: `1px solid ${chipColor}`,
                color: chipColor,
              }}
            >
              {chipLabel}
            </span>
            <SheetCloseButton onClose={close} />
          </div>
        </div>

        {/* GROUNDED IN — the bound source documents as chips (rule 6). */}
        {sources.length > 0 ? (
          <div
            style={S.div7}
          >
            {sources.map((d) => (
              <span
                key={d.id}
                style={S.span1}
              >
                <FileIcon ext={d.ext as FileExt} size="sm" />
                {d.file_name ?? d.title}
              </span>
            ))}
          </div>
        ) : null}

        {/* Activity log + live body (canvas lines[] + streamBox). Never a
            bare spinner: before the first line lands we say so in words. */}
        <div
          style={S.div8}
        >
          {stream.lines.length === 0 && running ? (
            <div
              style={S.div9}
            >
              CONNECTING TO THE RUN…
            </div>
          ) : null}

          {stream.lines.map((line, i) => (
            <LogRow
              key={line.id}
              line={line}
              current={running && i === lastLineIndex}
            />
          ))}

          {/* LIVE OUTPUT — the briefing body streaming in as serif, with the
              blinking accent caret while the run is live (canvas streamBox). */}
          {stream.streamedText ? (
            <div
              style={S.div10}
            >
              <MicroLabel style={S.microLabel2}>
                {complete ? "DRAFTED · FULL OUTPUT" : "DRAFTING · LIVE OUTPUT"}
              </MicroLabel>
              <div
                style={S.div11}
              >
                {stream.streamedText}
                {running ? (
                  <span
                    style={S.span2}
                  >
                    ▍
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* FAILURE — the log halts (its last line is already ERROR/danger),
            and this block states the honest consequences. Truthful to the
            engine: the failed briefing row is KEPT with its partial draft and
            full log (see lib/ai/generation.ts), so we do not claim "nothing was
            saved" — only that the sources are untouched and the partials stay. */}
        {failed ? (
          <div
            style={S.div12}
          >
            <div
              style={S.div13}
            />
            <div>
              <div
                style={S.div14}
              >
                This briefing didn&apos;t finish.
              </div>
              <p
                style={S.p2}
              >
                Your source documents are untouched. The partial draft and the
                log above are kept on this briefing, so you can see how far the
                run got before trying again.
              </p>
              <div style={S.div15}>
                <PrimaryButton
                  size="sm"
                  type="button"
                  onClick={() => router.push(retryHref)}
                >
                  <RetryIcon size={13} />
                  Try again
                </PrimaryButton>
                <GhostButton
                  size="sm"
                  type="button"
                  onClick={() => router.push("/compose")}
                >
                  Back to composer
                </GhostButton>
              </div>
            </div>
          </div>
        ) : null}

        {/* Metadata read failed (distinct from a NOT FOUND id): honest, and
            the run panel above still narrates whatever the stream carries. */}
        {meta.state === "error" ? (
          <p
            role="alert"
            style={S.p3}
          >
            We couldn&apos;t load this briefing&apos;s title and sources.{" "}
            {meta.detail}
          </p>
        ) : null}

        {/* Footer: the close-and-keep-running promise + Read the briefing. */}
        <div
          style={S.div16}
        >
          <MicroFaint>You can close this — the run keeps going.</MicroFaint>
          {complete ? (
            // TODO(card-012): /briefings/[id] is the reading view; navigate
            // anyway so the finished path is real today.
            <PrimaryButton
              size="sm"
              type="button"
              onClick={() => router.push(`/briefings/${id}`)}
            >
              <SparkIcon size={14} />
              Read the briefing
            </PrimaryButton>
          ) : running ? (
            <LinkButton type="button" onClick={close}>
              Close and let it run
            </LinkButton>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
