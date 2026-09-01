"use client";

// THE BRIEFING READING VIEW (card-012) — DESIGN-SPEC §3 BRIEFING, every value
// ported from the canvas isBriefSheet block (briefSheetCard + red margin,
// briefTitleStyle, briefLede, groundRow/sourceChips, sections with
// citeStyle/hoverCite tooltip, YOUR JUDGMENT rate up/down, NOTES, GENERATION
// LOG, auditWrap/auditHead/audit rows). It renders a REAL, complete briefing:
// its structured `sections` jsonb, its server-verified citations, its bound
// source documents, its persisted generation replay and audit trail.
//
// Constitution rules in play:
//   R1  no org filter anywhere — RLS is the only wall; a cross-org / deleted /
//       mistyped id yields zero rows → the canvas NOT FOUND sheet, never a
//       leak or an error dump. A still-generating / failed briefing is not a
//       reading-view case: it redirects to the generation surface.
//   R2  named columns on every select, including embedded resources.
//   R3  every write's { error } is surfaced (rating, note add, note delete,
//       and the RATED / NOTE audit lines each report their own failure).
//   R6  grounding is shown (GROUNDED IN chips) and the citation tooltip makes
//       each claim traceable to the exact source passage — the glass box.
//   R7  the feedback seam: rate up/down persists, survives reload, and its
//       failure is surfaced; section notes annotate + persist.
//   R9  fetches abort on unmount/retry; error ≠ empty ≠ not-found ≠ loading.
//   R10 mutation buttons show working states and update local state
//       optimistically — no refetch-the-world after a write.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { GhostButton, PrimaryButton } from "@/components/ui-sn/buttons";
import { FileIcon, type FileExt } from "@/components/ui-sn/file-icon";
import {
  ChevIcon,
  ClockIcon,
  NoteIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from "@/components/ui-sn/icons";
import { MicroFaint, MicroLabel } from "@/components/ui-sn/micro";
import { Sheet, SheetCloseButton } from "@/components/ui-sn/sheet";
import { ErrorBox } from "@/components/ui-sn/state-block";
import {
  addNote,
  auditNote,
  auditRated,
  deleteNote,
  fetchMyFeedback,
  fetchNotes,
  saveFeedback,
  type BriefingAuditRow,
  type BriefingNoteRow,
  type Rating,
} from "@/lib/briefing-actions";
import { createClient } from "@/lib/supabase/client";
import { CitationTooltip, type CitationTip } from "./citation-tooltip";

const SERIF = "var(--font-literata), Literata, Georgia, serif";
const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

const mix = (color: string, pct: string) =>
  `color-mix(in srgb, ${color} ${pct}, transparent)`;

// ---------------------------------------------------------------------------
// Row shapes (exactly the named columns this view reads)
// ---------------------------------------------------------------------------

type SourceDoc = {
  id: string;
  title: string;
  ext: string;
  file_name: string | null;
};

type Citation = { document_id: string; quote: string; label: string };
type ParsedSection = { head: string; paragraphs: string[]; citations: Citation[] };

type Briefing = {
  id: string;
  org_id: string;
  title: string | null;
  status: string;
  model: string;
  word_count: number | null;
  citation_count: number | null;
  created_at: string;
  sources: SourceDoc[];
  lede: string;
  sections: ParsedSection[];
};

type RawSourceRow = {
  document_id: string;
  documents: SourceDoc | SourceDoc[] | null;
};

function one<T>(rel: T | T[] | null): T | null {
  if (rel === null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

// Error ≠ empty ≠ loading ≠ not-found, always (R9). A "redirect" state exists
// because a generating/failed briefing belongs to the generation surface, not
// here — we send it there instead of pretending it is readable.
type SheetState =
  | { state: "loading" }
  | { state: "error"; detail: string }
  | { state: "notfound" }
  | { state: "redirect" }
  | { state: "ready"; briefing: Briefing };

type RailState<Row> =
  | { state: "loading" }
  | { state: "error"; detail: string }
  | { state: "populated"; rows: Row[] };

type GenEventRow = { kind: string; content: string; created_at: string };

// ---------------------------------------------------------------------------
// Defensive parse of the `sections` jsonb into the shape the view renders.
// Tolerant on purpose (rule: the quote is the truth; malformed json never
// throws) — anything unrecognized becomes an empty section list, which the
// view renders as an honest "no readable body" note rather than a crash.
// ---------------------------------------------------------------------------

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseCitations(v: unknown): Citation[] {
  if (!Array.isArray(v)) return [];
  const out: Citation[] = [];
  for (const c of v) {
    if (!c || typeof c !== "object") continue;
    const document_id = asString((c as { document_id?: unknown }).document_id);
    const quote = asString((c as { quote?: unknown }).quote);
    const label = asString((c as { label?: unknown }).label);
    if (!quote) continue; // a citation with no quote can't be traced — skip it
    out.push({ document_id, quote, label });
  }
  return out;
}

function parseSections(raw: unknown): { lede: string; sections: ParsedSection[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { lede: "", sections: [] };
  }
  const lede = asString((raw as { lede?: unknown }).lede);
  const list = (raw as { sections?: unknown }).sections;
  if (!Array.isArray(list)) return { lede, sections: [] };
  const sections: ParsedSection[] = list.map((s) => {
    if (!s || typeof s !== "object") return { head: "", paragraphs: [], citations: [] };
    const head = asString((s as { head?: unknown }).head);
    const paras = (s as { paragraphs?: unknown }).paragraphs;
    const paragraphs = Array.isArray(paras)
      ? paras.map(asString).filter((p) => p.trim().length > 0)
      : [];
    return { head, paragraphs, citations: parseCitations((s as { citations?: unknown }).citations) };
  });
  return { lede, sections };
}

// Which paragraph does a citation belong to? Match the quote against each
// paragraph (normalized whitespace, first ~40 chars); default to the section's
// last paragraph when there is no inline match — the pragmatic "marker at the
// paragraph end" the design allows when an exact offset can't be resolved.
function normalize(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

function citationParagraphIndex(section: ParsedSection, citation: Citation): number {
  const last = Math.max(0, section.paragraphs.length - 1);
  const needle = normalize(citation.quote).slice(0, 40);
  if (!needle) return last;
  for (let i = 0; i < section.paragraphs.length; i++) {
    if (normalize(section.paragraphs[i]).includes(needle)) return i;
  }
  return last;
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// "2026-09-01T09:41:00Z" → "1 SEP 2026 09:41" (canvas brief meta line).
function metaDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ISO → "HH:MM:SS" (generation-log timestamps, matching the generation surface).
function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ISO → "HH:MM" (note timestamps).
function hm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MODEL_LABEL: Record<string, string> = {
  "claude-sonnet-5": "SONNET 5",
  "claude-opus-5": "OPUS 5",
  "claude-haiku-4-5": "HAIKU 4.5",
};

function modelLabel(model: string): string {
  return MODEL_LABEL[model] ?? model.toUpperCase();
}

// ---------------------------------------------------------------------------
// A small inline danger line (canvas errRule pattern) for surfaced write
// failures inside the rail / body.
// ---------------------------------------------------------------------------

function InlineError({ title, detail }: { title: string; detail?: string }) {
  return (
    <div
      role="alert"
      style={{ display: "flex", gap: 10, marginTop: 9, animation: "sn-line .2s ease both" }}
    >
      <div style={{ width: 2, background: "var(--sn-danger)", flex: "none", borderRadius: 2 }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--sn-danger)" }}>{title}</div>
        {detail ? (
          <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--sn-card-muted)", marginTop: 3 }}>
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton — the briefing paper card with a red margin + accent sweep.
// ---------------------------------------------------------------------------

function BriefSheetSkeleton() {
  const bar = (extra: CSSProperties): CSSProperties => ({
    borderRadius: 3,
    background: "var(--sn-skel-bar2)",
    ...extra,
  });
  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        borderRadius: 16,
        background: "var(--sn-card)",
        border: "1px solid var(--sn-card-edge)",
        boxShadow: "0 30px 60px -30px rgba(0,0,0,.9)",
        overflow: "hidden",
        minHeight: 420,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "clamp(34px,3.4vw,52px)",
          top: 0,
          bottom: 0,
          width: 1,
          background: mix("var(--sn-card-margin)", "60%"),
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 90,
          background:
            "linear-gradient(90deg,transparent,color-mix(in srgb, var(--sn-accent) 13.3%, transparent),transparent)",
          animation: "sn-sweep 1.5s linear infinite",
        }}
      />
      <div style={{ padding: "34px clamp(22px,3vw,36px) 40px clamp(58px,6vw,76px)" }}>
        <div style={bar({ height: 10, width: "26%", background: "var(--sn-skel-bar1)" })} />
        <div style={bar({ height: 26, width: "70%", marginTop: 16, background: "var(--sn-skel-bar1)" })} />
        <div style={bar({ height: 9, width: "48%", marginTop: 16 })} />
        <div style={{ marginTop: 40, maxWidth: "66ch" }}>
          <div style={bar({ height: 12, width: "94%" })} />
          <div style={bar({ height: 12, width: "88%", marginTop: 14 })} />
          <div style={bar({ height: 12, width: "91%", marginTop: 14 })} />
          <div style={bar({ height: 12, width: "60%", marginTop: 14 })} />
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// The reading view
// ===========================================================================

export function BriefingView({ id }: { id: string }) {
  const router = useRouter();
  const close = useCallback(() => router.push("/"), [router]);

  const [sheet, setSheet] = useState<SheetState>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setSheet({ state: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  // Rails — each loads independently so one failure can't blank the others.
  const [myRating, setMyRating] = useState<Rating | null>(null);
  const [notes, setNotes] = useState<RailState<BriefingNoteRow>>({ state: "loading" });
  const [log, setLog] = useState<RailState<GenEventRow>>({ state: "loading" });
  const [audit, setAudit] = useState<RailState<BriefingAuditRow>>({ state: "loading" });
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myLabel, setMyLabel] = useState<string>("YOU");

  // --- Load everything -------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const supabase = createClient();

    async function run() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (signal.aborted) return;
      if (user) {
        setMyUserId(user.id);
        if (user.email) setMyLabel((user.email.split("@")[0] || user.email).toUpperCase());
      }

      // The briefing itself. RLS is the only org wall (R1). A malformed id
      // (postgres 22P02) can never be fixed by retrying → NOT FOUND; a zero-row
      // result (cross-org / deleted) is NOT FOUND; every other failure is an
      // honest, retryable ERROR (R9). A briefing that is not COMPLETE is not a
      // reading-view case — send it to the generation surface instead.
      const { data, error } = await supabase
        .from("briefings")
        .select(
          "id, org_id, title, status, model, word_count, citation_count, created_at, created_by, sections, briefing_sources (document_id, documents (id, title, ext, file_name))"
        )
        .eq("id", id)
        .abortSignal(signal)
        .maybeSingle();
      if (signal.aborted) return;
      if (error) {
        if (error.code === "22P02") setSheet({ state: "notfound" });
        else setSheet({ state: "error", detail: error.message });
        return;
      }
      if (data === null) {
        setSheet({ state: "notfound" });
        return;
      }
      const raw = data as unknown as {
        id: string;
        org_id: string;
        title: string | null;
        status: string;
        model: string;
        word_count: number | null;
        citation_count: number | null;
        created_at: string;
        sections: unknown;
        briefing_sources: RawSourceRow[] | null;
      };
      if (raw.status !== "complete") {
        // The generation surface (builder-11) owns generating + failed.
        setSheet({ state: "redirect" });
        router.replace(`/briefings/${id}/generating`);
        return;
      }
      const parsed = parseSections(raw.sections);
      setSheet({
        state: "ready",
        briefing: {
          id: raw.id,
          org_id: raw.org_id,
          title: raw.title,
          status: raw.status,
          model: raw.model,
          word_count: raw.word_count,
          citation_count: raw.citation_count,
          created_at: raw.created_at,
          sources: (raw.briefing_sources ?? [])
            .map((s) => one(s.documents))
            .filter((d): d is SourceDoc => d !== null),
          lede: parsed.lede,
          sections: parsed.sections,
        },
      });

      // Rails (rule 7 + rule 6 replay). Each surfaces its own error (R3/R9).
      fetchMyFeedback(id, signal).then(({ rating }) => {
        if (!signal.aborted) setMyRating(rating);
      });
      fetchNotes(id, signal).then(({ rows, error: nErr }) => {
        if (signal.aborted) return;
        setNotes(nErr ? { state: "error", detail: nErr } : { state: "populated", rows });
      });
      supabase
        .from("generation_events")
        .select("kind, content, created_at")
        .eq("briefing_id", id)
        .order("created_at", { ascending: true })
        .abortSignal(signal)
        .then(({ data: rows, error: gErr }) => {
          if (signal.aborted) return;
          setLog(
            gErr
              ? { state: "error", detail: gErr.message }
              : { state: "populated", rows: (rows ?? []) as GenEventRow[] }
          );
        });
      supabase
        .from("audit_events")
        .select("event, detail, actor, created_at")
        .eq("briefing_id", id)
        .order("created_at", { ascending: true })
        .abortSignal(signal)
        .then(({ data: rows, error: aErr }) => {
          if (signal.aborted) return;
          setAudit(
            aErr
              ? { state: "error", detail: aErr.message }
              : { state: "populated", rows: (rows ?? []) as BriefingAuditRow[] }
          );
        });
    }

    run();
    return () => controller.abort();
  }, [id, attempt, router]);

  // ----------------------------------------------------------------------
  // Terminal / non-ready states
  // ----------------------------------------------------------------------
  if (sheet.state === "notfound") {
    return (
      <Sheet variant="narrow" onClose={close} aria-label="Page not found">
        <div style={{ padding: "30px 32px 32px" }}>
          <div style={{ fontFamily: SERIF, fontSize: 23 }}>This page doesn&apos;t exist.</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--sn-muted)", margin: "9px 0 16px" }}>
            It may have been deleted, or the link may be wrong.
          </p>
          <PrimaryButton type="button" onClick={close}>
            Back to briefings
          </PrimaryButton>
        </div>
      </Sheet>
    );
  }

  if (sheet.state === "redirect") {
    // Briefly, while router.replace navigates to the generation surface.
    return (
      <Sheet variant="default" onClose={close} aria-label="Opening briefing">
        <div style={{ padding: "30px 32px" }}>
          <MicroLabel>THIS BRIEFING IS STILL RUNNING</MicroLabel>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--sn-muted)", margin: "10px 0 0" }}>
            Taking you to its live progress…
          </p>
        </div>
      </Sheet>
    );
  }

  if (sheet.state === "loading") {
    return (
      <Sheet variant="brief" onClose={close} aria-label="Loading briefing">
        <BriefSheetSkeleton />
      </Sheet>
    );
  }

  if (sheet.state === "error") {
    return (
      <Sheet variant="default" onClose={close} aria-label="Briefing unavailable">
        <div style={{ padding: "24px clamp(20px,3vw,32px) 28px" }}>
          <ErrorBox
            title="We couldn't load this briefing."
            body={`${sheet.detail} Nothing has been lost.`}
            onRetry={retry}
            style={{ marginBottom: 0 }}
          />
        </div>
      </Sheet>
    );
  }

  return (
    <ReadyBriefing
      briefing={sheet.briefing}
      close={close}
      myRating={myRating}
      setMyRating={setMyRating}
      notes={notes}
      setNotes={setNotes}
      log={log}
      audit={audit}
      setAudit={setAudit}
      myUserId={myUserId}
      myLabel={myLabel}
    />
  );
}

// ===========================================================================
// The ready sheet — split out so all the reading-view hooks run only when
// there is a real briefing to render (never conditionally).
// ===========================================================================

function ReadyBriefing({
  briefing,
  close,
  myRating,
  setMyRating,
  notes,
  setNotes,
  log,
  audit,
  setAudit,
  myUserId,
  myLabel,
}: {
  briefing: Briefing;
  close: () => void;
  myRating: Rating | null;
  setMyRating: (r: Rating | null) => void;
  notes: RailState<BriefingNoteRow>;
  setNotes: React.Dispatch<React.SetStateAction<RailState<BriefingNoteRow>>>;
  log: RailState<GenEventRow>;
  audit: RailState<BriefingAuditRow>;
  setAudit: React.Dispatch<React.SetStateAction<RailState<BriefingAuditRow>>>;
  myUserId: string | null;
  myLabel: string;
}) {
  const router = useRouter();
  const b = briefing;
  const title = b.title?.trim() ? b.title : "Untitled briefing";

  // Source lookup for the citation tooltip (document_id → its bound doc).
  const sourceById = useMemo(() => {
    const m = new Map<string, SourceDoc>();
    for (const s of b.sources) m.set(s.id, s);
    return m;
  }, [b.sources]);

  // Global citation numbering across the whole briefing (¹ ² ³ …), computed
  // once so the superscript markers are stable and monotonic.
  const sectionCitations = useMemo(() => {
    // Prefix sum of citation counts → each section's global numbering offset,
    // computed without any mutable counter carried across closures (the
    // superscript numbers stay globally monotonic ¹ ² ³ …).
    const bases = b.sections.reduce<number[]>((acc, section, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + b.sections[i - 1].citations.length);
      return acc;
    }, []);
    return b.sections.map((section, sIdx) => {
      const perParagraph = new Map<number, { citation: Citation; num: number }[]>();
      section.citations.forEach((citation, localIndex) => {
        const num = bases[sIdx] + localIndex + 1;
        const pIdx = citationParagraphIndex(section, citation);
        const arr = perParagraph.get(pIdx) ?? [];
        arr.push({ citation, num });
        perParagraph.set(pIdx, arr);
      });
      return perParagraph;
    });
  }, [b.sections]);

  const citationTotal = useMemo(
    () => b.sections.reduce((sum, s) => sum + s.citations.length, 0),
    [b.sections]
  );
  const citationCount = b.citation_count ?? citationTotal;

  // --- Citation tooltip -------------------------------------------------
  const [tip, setTip] = useState<CitationTip | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTip = useCallback(
    (e: React.MouseEvent, citation: Citation) => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
      const r = e.currentTarget.getBoundingClientRect();
      const w = typeof window !== "undefined" ? window.innerWidth : 1440;
      const doc = sourceById.get(citation.document_id);
      setTip({
        ext: doc?.ext ?? "TXT",
        fileName: doc?.file_name ?? doc?.title ?? citation.label ?? "Source document",
        passageLabel: citation.label || "SOURCE PASSAGE",
        quote: citation.quote,
        x: Math.min(w - 172, Math.max(172, r.left + r.width / 2)),
        y: r.top,
        below: r.top < 200 ? r.bottom : 0,
      });
    },
    [sourceById]
  );
  const hideTip = useCallback(() => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(null), 160);
  }, []);
  const holdTip = useCallback(() => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
  }, []);
  useEffect(() => () => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
  }, []);

  // --- Feedback (rule 7) ------------------------------------------------
  const [working, setWorking] = useState<Rating | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateEditing, setRateEditing] = useState(false);

  const pushAuditRow = useCallback(
    (row: BriefingAuditRow | null) => {
      if (!row) return;
      setAudit((a) => (a.state === "populated" ? { state: "populated", rows: [...a.rows, row] } : a));
    },
    [setAudit]
  );

  const rate = useCallback(
    async (rating: Rating) => {
      if (working) return;
      const previous = myRating;
      setWorking(rating);
      setRateError(null);
      // R10: optimistic — the pill reflects the choice immediately.
      setMyRating(rating);
      const { error } = await saveFeedback(b.id, b.org_id, rating);
      if (error) {
        setMyRating(previous); // revert the optimistic change (R3)
        setWorking(null);
        setRateError(error);
        return;
      }
      setWorking(null);
      setRateEditing(false);
      // Companion audit line (rule 6). Best-effort: its failure is a soft
      // warning, never an un-rate of what already saved.
      const { row, error: aErr } = await auditRated(b.id, b.org_id, rating);
      if (aErr) setRateError(`Your rating saved, but its history line didn't. ${aErr}`);
      else pushAuditRow(row);
    },
    [working, myRating, b.id, b.org_id, setMyRating, pushAuditRow]
  );

  const rated = myRating !== null && !rateEditing;
  const ratedLine =
    myRating === "up" ? "YOU RATED THIS USEFUL" : "YOU RATED THIS NOT USEFUL";

  // --- Notes (rule 7) ---------------------------------------------------
  const [openNote, setOpenNote] = useState<number | null>(null);
  const [hoverSection, setHoverSection] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteDeleteError, setNoteDeleteError] = useState<string | null>(null);

  const noteRows = notes.state === "populated" ? notes.rows : [];

  const openNoteFor = useCallback((idx: number) => {
    setOpenNote(idx);
    setDraft("");
    setNoteError(null);
  }, []);

  const submitNote = useCallback(
    async (idx: number) => {
      const val = draft.trim();
      if (!val) {
        setOpenNote(null);
        return;
      }
      if (noteSaving) return;
      setNoteSaving(true);
      setNoteError(null);
      const { row, error } = await addNote(b.id, b.org_id, idx, val);
      if (error || !row) {
        setNoteSaving(false);
        setNoteError(error ?? "The note wasn't saved.");
        return; // stay open; nothing pretended (R3)
      }
      // R10: optimistic append; no refetch-the-world.
      setNotes((n) =>
        n.state === "populated" ? { state: "populated", rows: [...n.rows, row] } : n
      );
      setNoteSaving(false);
      setOpenNote(null);
      setDraft("");
      const { row: aRow, error: aErr } = await auditNote(
        b.id,
        b.org_id,
        b.sections[idx]?.head ?? `Section ${idx + 1}`,
        val
      );
      if (aErr) setNoteError(`Your note saved, but its history line didn't. ${aErr}`);
      else pushAuditRow(aRow);
    },
    [draft, noteSaving, b.id, b.org_id, b.sections, setNotes, pushAuditRow]
  );

  const removeNote = useCallback(
    async (noteId: string) => {
      setNoteDeleteError(null);
      // R10: optimistic removal, restore on failure.
      const previous = notes;
      setNotes((n) =>
        n.state === "populated"
          ? { state: "populated", rows: n.rows.filter((r) => r.id !== noteId) }
          : n
      );
      const { error } = await deleteNote(noteId);
      if (error) {
        setNotes(previous);
        setNoteDeleteError(error);
      }
    },
    [notes, setNotes]
  );

  // --- Generation log (collapsible) + Audit toggle ----------------------
  const [logOpen, setLogOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(false);

  const auditCount = audit.state === "populated" ? audit.rows.length : null;

  return (
    <>
      <Sheet variant="brief" onClose={close} aria-label={title}>
        <div
          style={{
            position: "relative",
            borderRadius: 16,
            background: "var(--sn-card)",
            color: "var(--sn-card-text)",
            border: "1px solid var(--sn-card-edge)",
            boxShadow: "0 30px 60px -30px rgba(0,0,0,.9)",
            overflow: "hidden",
          }}
        >
          {/* Red margin rule (canvas briefSheetMargin). */}
          <div
            style={{
              position: "absolute",
              left: "clamp(34px,3.4vw,52px)",
              top: 0,
              bottom: 0,
              width: 1,
              background: "var(--sn-card-margin)",
            }}
          />
          <div style={{ padding: "26px clamp(22px,3vw,36px) 32px clamp(58px,6vw,76px)" }}>
            {/* Header: id-label · title · meta · audit toggle · close */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 18,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                {/* Not a sequential number — the id's first hex quad, honestly
                    labelled, so it's stable and real rather than invented. */}
                <MicroLabel>BRIEFING {b.id.slice(0, 4).toUpperCase()} · COMPLETE</MicroLabel>
                <h1
                  style={{
                    fontFamily: SERIF,
                    fontSize: "clamp(24px,3.4vw,33px)",
                    fontWeight: 400,
                    letterSpacing: "-.02em",
                    lineHeight: 1.16,
                    margin: "12px 0 0",
                    maxWidth: "20ch",
                    color: "var(--sn-card-text)",
                  }}
                >
                  {title}
                </h1>
                {/* Author omitted honestly: briefings.created_by is an
                    auth.users id and auth.users is not client-readable, so a
                    reliable author NAME can't be shown here. Date + counts +
                    model are all real. */}
                <MicroLabel style={{ display: "block", marginTop: 11 }}>
                  {metaDateTime(b.created_at)} · {b.sources.length} SOURCE
                  {b.sources.length === 1 ? "" : "S"} · {citationCount} CITATION
                  {citationCount === 1 ? "" : "S"} · {modelLabel(b.model)}
                </MicroLabel>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setAuditOpen((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    height: 31,
                    padding: "0 14px",
                    borderRadius: 100,
                    border: `1px solid ${auditOpen ? "var(--sn-card-text)" : "var(--sn-card-btn-border)"}`,
                    background: auditOpen ? "var(--sn-card-text)" : "transparent",
                    color: auditOpen ? "var(--sn-card)" : "var(--sn-card-text)",
                    fontFamily: SANS,
                    fontSize: 12,
                    cursor: "pointer",
                    transition: "all .16s",
                  }}
                >
                  <ClockIcon size={13} />
                  {auditOpen ? "Hide audit" : "Audit trail"}
                </button>
                <SheetCloseButton onClose={close} />
              </div>
            </div>

            {/* GROUNDED IN — the bound source documents as chips (rule 6). */}
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                margin: "18px 0 0",
                padding: "14px 0",
                borderTop: "1px solid var(--sn-card-rule)",
                borderBottom: "1px solid var(--sn-card-rule)",
              }}
            >
              <MicroLabel style={{ marginRight: 3 }}>GROUNDED IN</MicroLabel>
              {b.sources.length === 0 ? (
                <MicroFaint>NO SOURCES RECORDED</MicroFaint>
              ) : (
                b.sources.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => router.push(`/documents/${d.id}`)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      height: 32,
                      padding: "0 13px 0 6px",
                      borderRadius: 100,
                      border: "1px solid var(--sn-card-btn-border)",
                      background: "transparent",
                      color: "var(--sn-card-text)",
                      fontFamily: SANS,
                      fontSize: 12,
                      cursor: "pointer",
                      transition: "border-color .16s",
                    }}
                  >
                    <FileIcon ext={d.ext as FileExt} size="sm" />
                    {d.file_name ?? d.title}
                  </button>
                ))
              )}
            </div>

            {/* Body (max 66ch) + right rail */}
            <div
              style={{
                display: "flex",
                gap: "clamp(20px,3vw,36px)",
                padding: "24px 0 0",
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 300, maxWidth: "66ch" }}>
                {b.lede ? (
                  <p
                    style={{
                      fontFamily: SERIF,
                      fontSize: "clamp(17px,1.8vw,19px)",
                      lineHeight: 1.6,
                      margin: "0 0 22px",
                      color: "var(--sn-card-text)",
                    }}
                  >
                    {b.lede}
                  </p>
                ) : null}

                {b.sections.length === 0 ? (
                  <p style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.8, color: "var(--sn-card-muted)" }}>
                    This briefing has no readable body.
                  </p>
                ) : (
                  b.sections.map((section, idx) => {
                    const perParagraph = sectionCitations[idx];
                    const sectionNotes = noteRows.filter((n) => n.section_index === idx);
                    const noteActive = hoverSection === idx || openNote === idx;
                    return (
                      <div
                        key={idx}
                        onMouseEnter={() => setHoverSection(idx)}
                        onMouseLeave={() => setHoverSection((h) => (h === idx ? null : h))}
                        style={{ position: "relative", marginBottom: 24 }}
                      >
                        <h2
                          style={{
                            fontFamily: SANS,
                            fontSize: 10.5,
                            fontWeight: 600,
                            letterSpacing: ".17em",
                            textTransform: "uppercase",
                            color: "var(--sn-card-muted)",
                            margin: "0 0 9px",
                          }}
                        >
                          {section.head}
                        </h2>
                        {section.paragraphs.map((para, pIdx) => {
                          const marks = perParagraph.get(pIdx) ?? [];
                          return (
                            <p
                              key={pIdx}
                              style={{
                                fontFamily: SERIF,
                                fontSize: 16,
                                lineHeight: 1.8,
                                margin: "0 0 12px",
                                color: "var(--sn-card-text)",
                              }}
                            >
                              {para}
                              {marks.map(({ citation, num }) => (
                                <span
                                  key={num}
                                  tabIndex={0}
                                  role="button"
                                  aria-label={`Citation ${num}: ${citation.label || "source passage"}`}
                                  onMouseEnter={(e) => showTip(e, citation)}
                                  onMouseLeave={hideTip}
                                  onFocus={(e) =>
                                    showTip(
                                      e as unknown as React.MouseEvent,
                                      citation
                                    )
                                  }
                                  onBlur={hideTip}
                                  style={{
                                    cursor: "help",
                                    color: "var(--sn-accent)",
                                    verticalAlign: "super",
                                    fontSize: 11,
                                    fontFamily: MONO,
                                    padding: "0 2px",
                                    borderBottom: "1px dotted var(--sn-accent)",
                                  }}
                                >
                                  {num}
                                </span>
                              ))}
                            </p>
                          );
                        })}

                        {/* Margin note button (canvas noteBtn), fades in on hover. */}
                        <button
                          type="button"
                          aria-label={`Comment on “${section.head || `section ${idx + 1}`}”`}
                          onClick={() => openNoteFor(idx)}
                          style={{
                            position: "absolute",
                            left: -30,
                            top: 0,
                            width: 24,
                            height: 24,
                            borderRadius: 100,
                            border: "1px solid var(--sn-card-btn-border)",
                            background: "var(--sn-card)",
                            color: "var(--sn-card-muted)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: noteActive ? 1 : 0,
                            transform: `translateX(${noteActive ? "0" : "-4px"})`,
                            transition:
                              "opacity .24s cubic-bezier(.32,.72,0,1),transform .24s cubic-bezier(.32,.72,0,1)",
                          }}
                        >
                          <NoteIcon size={13} />
                        </button>

                        {/* Saved notes for this section (accent-left cards). */}
                        {sectionNotes.map((n) => {
                          const mine = myUserId !== null && n.user_id === myUserId;
                          return (
                            <div
                              key={n.id}
                              style={{
                                marginTop: 11,
                                background: mix("var(--sn-accent)", "10%"),
                                borderLeft: "2px solid var(--sn-accent)",
                                padding: "10px 12px",
                                borderRadius: "0 8px 8px 0",
                                animation: "sn-line .26s cubic-bezier(.32,.72,0,1) both",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "baseline",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{
                                    fontFamily: MONO,
                                    fontSize: 8.5,
                                    letterSpacing: ".12em",
                                    color: "var(--sn-card-muted)",
                                  }}
                                >
                                  {(mine ? myLabel : "TEAMMATE")} · {hm(n.created_at)}
                                </div>
                                {mine ? (
                                  <button
                                    type="button"
                                    onClick={() => removeNote(n.id)}
                                    style={{
                                      border: 0,
                                      background: "transparent",
                                      padding: 0,
                                      fontFamily: MONO,
                                      fontSize: 8.5,
                                      letterSpacing: ".1em",
                                      color: "var(--sn-card-muted)",
                                      cursor: "pointer",
                                      textDecoration: "underline",
                                    }}
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                              <div
                                style={{
                                  fontFamily: SERIF,
                                  fontSize: 13.5,
                                  lineHeight: 1.55,
                                  marginTop: 5,
                                  color: "var(--sn-card-text)",
                                }}
                              >
                                {n.body}
                              </div>
                            </div>
                          );
                        })}

                        {/* The note composer. */}
                        {openNote === idx ? (
                          <div style={{ marginTop: 11, animation: "sn-line .2s ease both" }}>
                            <textarea
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder="Comment on this section…"
                              aria-label="Comment on this section"
                              style={{
                                width: "100%",
                                height: 66,
                                border: "1px solid var(--sn-card-btn-border)",
                                borderRadius: 10,
                                background: "var(--sn-input-bg)",
                                color: "var(--sn-card-text)",
                                padding: "9px 11px",
                                fontFamily: SERIF,
                                fontSize: 13.5,
                                lineHeight: 1.5,
                                resize: "none",
                              }}
                            />
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                              <button
                                type="button"
                                onClick={() => submitNote(idx)}
                                disabled={noteSaving}
                                aria-busy={noteSaving || undefined}
                                style={{
                                  height: 28,
                                  padding: "0 13px",
                                  borderRadius: 100,
                                  border: 0,
                                  background: "var(--sn-accent)",
                                  color: "var(--sn-on-accent)",
                                  fontFamily: SANS,
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  cursor: noteSaving ? "default" : "pointer",
                                }}
                              >
                                {noteSaving ? "Saving…" : "Comment"}
                              </button>
                              <GhostButton
                                type="button"
                                size="sm"
                                onClick={() => setOpenNote(null)}
                                disabled={noteSaving}
                              >
                                Cancel
                              </GhostButton>
                            </div>
                            {noteError ? (
                              <InlineError title="That note didn't save cleanly." detail={noteError} />
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right rail 212px */}
              <div style={{ width: 212, flex: "none" }}>
                {/* YOUR JUDGMENT (rule 7) */}
                <MicroLabel>YOUR JUDGMENT</MicroLabel>
                <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
                  <button
                    type="button"
                    onClick={() => rate("up")}
                    disabled={working !== null}
                    aria-busy={working === "up" || undefined}
                    aria-pressed={myRating === "up"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      height: 31,
                      padding: "0 14px",
                      borderRadius: 100,
                      cursor: working ? "default" : "pointer",
                      fontFamily: SANS,
                      fontSize: 12,
                      fontWeight: 500,
                      transition: "all .16s",
                      border: `1px solid ${myRating === "up" ? "var(--sn-accent)" : "var(--sn-card-btn-border)"}`,
                      background: myRating === "up" ? "var(--sn-accent)" : "transparent",
                      color: myRating === "up" ? "var(--sn-on-accent)" : "var(--sn-card-text)",
                    }}
                  >
                    <ThumbUpIcon size={14} />
                    {working === "up" ? "Saving…" : "Useful"}
                  </button>
                  <button
                    type="button"
                    onClick={() => rate("down")}
                    disabled={working !== null}
                    aria-busy={working === "down" || undefined}
                    aria-pressed={myRating === "down"}
                    aria-label={working === "down" ? "Saving…" : "Not useful"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 31,
                      height: 31,
                      borderRadius: 100,
                      cursor: working ? "default" : "pointer",
                      transition: "all .16s",
                      border: `1px solid ${myRating === "down" ? "var(--sn-danger)" : "var(--sn-card-btn-border)"}`,
                      background: myRating === "down" ? "var(--sn-danger)" : "transparent",
                      color: myRating === "down" ? "var(--sn-on-danger)" : "var(--sn-card-text)",
                    }}
                  >
                    <ThumbDownIcon size={14} />
                  </button>
                </div>
                {rated ? (
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 9.5,
                      letterSpacing: ".08em",
                      color: "var(--sn-card-muted)",
                      marginTop: 11,
                      animation: "sn-line .2s ease both",
                    }}
                  >
                    {ratedLine} ·{" "}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => setRateEditing(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setRateEditing(true);
                      }}
                      style={{ textDecoration: "underline", cursor: "pointer" }}
                    >
                      EDIT
                    </span>
                  </div>
                ) : null}
                {rateError ? <InlineError title="Your rating didn't save." detail={rateError} /> : null}

                {/* NOTES rail */}
                <MicroLabel style={{ display: "block", marginTop: 22 }}>NOTES</MicroLabel>
                <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 9 }}>
                  {notes.state === "loading" ? (
                    <MicroFaint>LOADING</MicroFaint>
                  ) : notes.state === "error" ? (
                    <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--sn-danger)" }}>
                      Couldn&apos;t load notes. {notes.detail}
                    </div>
                  ) : noteRows.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: "var(--sn-card-muted)", lineHeight: 1.55 }}>
                      Hover a section and use the margin mark to comment.
                    </div>
                  ) : (
                    noteRows.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          borderLeft: "2px solid var(--sn-accent)",
                          paddingLeft: 10,
                          color: "var(--sn-card-text)",
                        }}
                      >
                        <MicroFaint>
                          {b.sections[n.section_index]?.head ?? `SECTION ${n.section_index + 1}`}
                        </MicroFaint>
                        <div style={{ fontFamily: SERIF, fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
                          {n.body}
                        </div>
                      </div>
                    ))
                  )}
                  {noteDeleteError ? (
                    <InlineError title="That note couldn't be deleted." detail={noteDeleteError} />
                  ) : null}
                </div>

                {/* GENERATION LOG (collapsible replay — rule 8's persisted narration) */}
                <button
                  type="button"
                  onClick={() => setLogOpen((v) => !v)}
                  aria-expanded={logOpen}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    border: 0,
                    background: "transparent",
                    padding: 0,
                    marginTop: 22,
                    cursor: "pointer",
                    fontFamily: MONO,
                    fontSize: 9,
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    color: "var(--sn-card-muted)",
                  }}
                >
                  <ChevIcon
                    size={11}
                    style={{ transform: logOpen ? "none" : "rotate(-90deg)", transition: "transform .16s" }}
                  />
                  GENERATION LOG
                </button>
                {logOpen ? (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                    {log.state === "loading" ? (
                      <MicroFaint>LOADING</MicroFaint>
                    ) : log.state === "error" ? (
                      <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--sn-danger)" }}>
                        Couldn&apos;t load the log. {log.detail}
                      </div>
                    ) : log.rows.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: "var(--sn-card-muted)", lineHeight: 1.55 }}>
                        No log was recorded for this briefing.
                      </div>
                    ) : (
                      log.rows.map((l, i) => (
                        <div
                          key={i}
                          style={{
                            fontFamily: MONO,
                            fontSize: 9.5,
                            lineHeight: 1.5,
                            color: "var(--sn-card-muted)",
                            wordBreak: "break-word",
                          }}
                        >
                          <span style={{ opacity: 0.6 }}>{clockTime(l.created_at)}</span> {l.content}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            {/* AUDIT TRAIL (toggled) */}
            {auditOpen ? (
              <div
                style={{
                  borderTop: "1px solid var(--sn-card-text)",
                  marginTop: 24,
                  paddingTop: 18,
                  animation: "sn-line .22s ease both",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <MicroLabel>AUDIT TRAIL</MicroLabel>
                  <MicroFaint>
                    APPEND-ONLY · {auditCount ?? "…"} EVENT{auditCount === 1 ? "" : "S"} · ORG-SCOPED
                  </MicroFaint>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: 456 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "96px 118px 1fr 124px",
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: ".14em",
                        color: "var(--sn-card-muted)",
                        padding: "12px 0 8px",
                        borderBottom: "1px solid var(--sn-card-rule)",
                      }}
                    >
                      <span>TIME</span>
                      <span>EVENT</span>
                      <span>DETAIL</span>
                      <span>ACTOR</span>
                    </div>
                    {audit.state === "loading" ? (
                      <MicroFaint style={{ display: "block", padding: "12px 0" }}>LOADING</MicroFaint>
                    ) : audit.state === "error" ? (
                      <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--sn-danger)", padding: "12px 0" }}>
                        Couldn&apos;t load the audit trail. {audit.detail}
                      </div>
                    ) : audit.rows.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: "var(--sn-card-muted)", padding: "12px 0" }}>
                        No events recorded yet.
                      </div>
                    ) : (
                      audit.rows.map((a, i) => {
                        const system = a.actor === "SYSTEM";
                        return (
                          <div
                            key={i}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "96px 118px 1fr 124px",
                              alignItems: "baseline",
                              padding: "8px 0",
                              borderBottom: "1px solid var(--sn-card-rule)",
                            }}
                          >
                            <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--sn-card-muted)" }}>
                              {clockTime(a.created_at)}
                            </span>
                            <span
                              style={{
                                fontFamily: MONO,
                                fontSize: 9,
                                letterSpacing: ".12em",
                                color: system ? "var(--sn-card-muted)" : "var(--sn-accent)",
                              }}
                            >
                              {a.event}
                            </span>
                            <span style={{ fontSize: 12.5, color: "var(--sn-card-text)" }}>{a.detail}</span>
                            <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--sn-card-muted)" }}>
                              {a.actor}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Sheet>

      {/* CITATION TOOLTIP — fixed-positioned, the glass box (rule 6). */}
      {tip ? <CitationTooltip tip={tip} onHold={holdTip} onRelease={hideTip} /> : null}
    </>
  );
}
