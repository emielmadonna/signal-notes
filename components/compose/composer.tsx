"use client";

// THE COMPOSER (card-011) — DESIGN-SPEC §3 SHEETS/COMPOSER + §5 D1 model
// picker. Values ported from the canvas isComposeSheet block (sheetTitle,
// emptyP, titleFieldPlain, pickTiles, genBtnStyle, countLabel, noneSelected)
// and, for the model pills, the canvas KIND-segment style.
//
// Flow: pick the documents the briefing may read (preselected from the
// selection the user arrived with, ?docs=), give it an optional title, choose
// the model, and Generate. Generate POSTs to /api/briefings/generate; the
// engine returns the new briefing id in the X-Briefing-Id header immediately
// and keeps the run alive server-side, so we navigate to the generation
// surface, which RESUMES it via the events route.
//
// Constitution rules in play:
//   R9  the document list's four states are honest (loading ≠ empty ≠ error),
//       and a non-2xx from Generate is surfaced — never a blank success.
//   R10 Generate carries a real working state ("Starting…") and only leaves
//       the sheet once the id is in hand.
import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui-sn/buttons";
import { FileIcon } from "@/components/ui-sn/file-icon";
import { PlusIcon, SparkIcon } from "@/components/ui-sn/icons";
import { MicroLabel } from "@/components/ui-sn/micro";
import { Sheet, SheetCloseButton } from "@/components/ui-sn/sheet";
import { ErrorBox } from "@/components/ui-sn/state-block";
import { DEFAULT_MODEL, type AllowedModel } from "@/lib/briefing-types";
import { startGeneration } from "@/lib/use-generation-stream";
import { useWorkspaceData } from "@/lib/workspace-data";

const SERIF = "var(--font-literata), Literata, Georgia, serif";
const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

// D1 model picker: the allowlist ids (lib/briefing-types) in the canvas's
// segmented-pill language, each with its one-word character.
const MODEL_OPTIONS: {
  id: AllowedModel;
  name: string;
  note: string;
}[] = [
  { id: "claude-sonnet-5", name: "Sonnet", note: "balanced" },
  { id: "claude-opus-5", name: "Opus", note: "deepest" },
  { id: "claude-haiku-4-5", name: "Haiku", note: "fastest" },
];

function modelLabel(id: AllowedModel): string {
  const m = MODEL_OPTIONS.find((o) => o.id === id) ?? MODEL_OPTIONS[0];
  return `${m.name} — ${m.note}`;
}

export function Composer({ preselectedIds }: { preselectedIds: string[] }) {
  const router = useRouter();
  const close = useCallback(() => router.push("/"), [router]);

  // The org's documents (RLS-scoped, named columns, aborting) via the shared
  // workspace data layer — the composer reads only `.documents`.
  const { documents } = useWorkspaceData();

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(preselectedIds)
  );
  const [title, setTitle] = useState("");
  const [model, setModel] = useState<AllowedModel>(DEFAULT_MODEL);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Keep the selection honest: only ids that still exist in the list survive.
  const liveSelected = useMemo(() => {
    if (documents.state !== "populated") return selected;
    const live = new Set(documents.rows.map((d) => d.id));
    return new Set([...selected].filter((id) => live.has(id)));
  }, [documents, selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const count = liveSelected.size;

  const generate = useCallback(async () => {
    if (count === 0 || starting) return;
    setStarting(true);
    setStartError(null);
    const result = await startGeneration({
      documentIds: [...liveSelected],
      title: title.trim() === "" ? undefined : title.trim(),
      model,
    });
    if ("error" in result) {
      // R9/R10: the failure is surfaced right here; the sheet stays open.
      setStarting(false);
      setStartError(result.error);
      return;
    }
    // The run is live server-side; resume it on the generation surface.
    router.replace(`/briefings/${result.id}/generating`);
  }, [count, starting, liveSelected, title, model, router]);

  // ----------------------------------------------------------------------
  // Header (shared across every state).
  // ----------------------------------------------------------------------
  const header = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(20px,2.4vw,24px)",
            fontWeight: 400,
            margin: 0,
            color: "var(--sn-text)",
          }}
        >
          New briefing
        </h1>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.65,
            color: "var(--sn-muted)",
            margin: "9px 0 0",
          }}
        >
          Pick the documents it may read. It will read nothing else.
        </p>
      </div>
      <SheetCloseButton onClose={close} />
    </div>
  );

  const pillStyle = (on: boolean): CSSProperties => ({
    height: 29,
    padding: "0 14px",
    borderRadius: 100,
    border: `1px solid ${on ? "var(--sn-accent)" : "var(--sn-border)"}`,
    background: "transparent",
    color: on ? "var(--sn-accent)" : "var(--sn-muted)",
    fontFamily: SANS,
    fontSize: 12,
    fontWeight: 400,
    cursor: "pointer",
    transition: "all .16s",
  });

  return (
    <Sheet variant="default" onClose={close} aria-label="New briefing">
      <div style={{ padding: "24px clamp(20px,3vw,30px) 28px" }}>
        {header}

        {documents.state === "loading" ? (
          <p
            style={{
              fontFamily: "var(--font-plex-mono), monospace",
              fontSize: 11,
              letterSpacing: ".12em",
              color: "var(--sn-faint)",
              margin: "22px 0 0",
              animation: "sn-pulse 1.1s ease-in-out infinite",
            }}
          >
            LOADING YOUR DOCUMENTS…
          </p>
        ) : documents.state === "error" ? (
          <div style={{ marginTop: 20 }}>
            <ErrorBox
              title="We couldn't load your documents."
              body={`${documents.errorDetail ?? ""} Nothing has been lost.`}
              style={{ marginBottom: 0 }}
            />
          </div>
        ) : documents.state === "empty" ? (
          // Zero-docs edge (canvas): nothing to ground a briefing in yet.
          <div style={{ padding: "22px 0 4px", maxWidth: "52ch" }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, color: "var(--sn-text)" }}>
              Nothing to ground a briefing in yet.
            </div>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "var(--sn-muted)",
                margin: "9px 0 16px",
              }}
            >
              Add a document first — a call transcript is the fastest start.
            </p>
            <PrimaryButton
              type="button"
              onClick={() => router.push("/documents/new")}
            >
              <PlusIcon size={14} />
              Add a document
            </PrimaryButton>
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            {/* TITLE — OPTIONAL (serif underline field). */}
            <MicroLabel>TITLE — OPTIONAL</MicroLabel>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Acme Logistics: pre-strategy briefing"
              aria-label="Briefing title (optional)"
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                borderTop: 0,
                borderLeft: 0,
                borderRight: 0,
                borderBottom: "1px solid var(--sn-border)",
                background: "transparent",
                fontFamily: SERIF,
                fontSize: 17,
                color: "var(--sn-text)",
                padding: "8px 0",
                outline: 0,
              }}
            />

            {/* Document pick tiles (same selection language as the tiles). */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(134px,1fr))",
                gap: 14,
                marginTop: 20,
              }}
            >
              {documents.rows.map((d) => {
                const on = liveSelected.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggle(d.id)}
                    aria-pressed={on}
                    style={{
                      padding: "12px 8px",
                      borderRadius: 14,
                      border: 0,
                      cursor: "pointer",
                      background: on ? "var(--sn-tile-selected-bg)" : "transparent",
                      transition: "background .18s",
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      <FileIcon ext={d.ext} size="md" selected={on} />
                      {/* Selection check badge (accent dot, scales in). */}
                      <span
                        style={{
                          position: "absolute",
                          top: -6,
                          right: "calc(50% - 32px)",
                          width: 19,
                          height: 19,
                          borderRadius: 100,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          background: on ? "var(--sn-accent)" : "transparent",
                          border: `1px solid ${on ? "var(--sn-accent)" : "var(--sn-border)"}`,
                          color: "var(--sn-on-accent)",
                          opacity: on ? 1 : 0,
                          transform: `scale(${on ? 1 : 0.7})`,
                          transition: "all .18s cubic-bezier(.2,.8,.3,1)",
                        }}
                      >
                        {on ? "✓" : ""}
                      </span>
                    </div>
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: 11.5,
                        lineHeight: 1.4,
                        marginTop: 10,
                        wordBreak: "break-word",
                        color: "var(--sn-text)",
                      }}
                    >
                      {d.file_name ?? d.title}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* MODEL PICKER (D1): micro label + segmented pills. */}
            <div style={{ marginTop: 22 }}>
              <MicroLabel>MODEL</MicroLabel>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                {MODEL_OPTIONS.map((o) => {
                  const on = model === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setModel(o.id)}
                      aria-pressed={on}
                      style={pillStyle(on)}
                    >
                      {o.name} — {o.note}
                      {o.id === DEFAULT_MODEL ? " (default)" : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Generate + running count + chosen model, restated. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 22,
                flexWrap: "wrap",
              }}
            >
              <PrimaryButton
                type="button"
                onClick={generate}
                disabled={count === 0}
                working={starting}
                workingLabel="Starting…"
                style={{ height: 36, padding: "0 18px" }}
              >
                <SparkIcon size={14} />
                Generate briefing
              </PrimaryButton>
              <MicroLabel>
                {count === 0
                  ? "NO DOCUMENTS SELECTED"
                  : `${count} DOCUMENT${count === 1 ? "" : "S"} · ${modelLabel(model).toUpperCase()}`}
              </MicroLabel>
            </div>

            {/* Disabled-at-zero copy (exact canvas string). */}
            {count === 0 ? (
              <p
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: "var(--sn-muted)",
                  margin: "9px 0 0",
                }}
              >
                Select at least one document — a briefing with no sources would
                just be a guess.
              </p>
            ) : null}

            {/* Generate failure, surfaced inline (R9/R10). */}
            {startError ? (
              <div
                role="alert"
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 14,
                  animation: "sn-line .2s ease both",
                }}
              >
                <div
                  style={{
                    width: 2,
                    background: "var(--sn-danger)",
                    flex: "none",
                    borderRadius: 2,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: "var(--sn-danger)",
                    }}
                  >
                    The briefing couldn&apos;t be started.
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      color: "var(--sn-muted)",
                      marginTop: 3,
                    }}
                  >
                    {startError}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Sheet>
  );
}
