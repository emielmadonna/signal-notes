"use client";

// DEV-ONLY gallery body (see app/design/page.tsx — ships with P2 as the
// card's screenshot target, deleted in P5 hardening).
// Renders every ui-sn primitive twice: once inside a
// data-theme="dark" section and once inside data-theme="light", so both
// palettes can be screenshotted side by side on one page.
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  DangerButton,
  GhostButton,
  LinkButton,
  PrimaryButton,
  TinyLink,
} from "@/components/ui-sn/buttons";
import { FileIcon, type FileExt, type FileIconSize } from "@/components/ui-sn/file-icon";
import {
  ChevIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  EditIcon,
  MarkIcon,
  MoonIcon,
  NoteIcon,
  OpenIcon,
  PlusIcon,
  RetryIcon,
  SearchIcon,
  SparkIcon,
  SunIcon,
  ThumbDownIcon,
  ThumbUpIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/ui-sn/icons";
import { MicroAccent, MicroFaint, MicroLabel } from "@/components/ui-sn/micro";
import { Sheet, SheetCloseButton, type SheetVariant } from "@/components/ui-sn/sheet";
import {
  BriefingCardSkeleton,
  DocTileSkeleton,
  EmptyBox,
  ErrorBox,
} from "@/components/ui-sn/state-block";
import { Toast } from "@/components/ui-sn/toast";
import { useTheme } from "@/components/theme-provider";

const SERIF = "var(--font-literata), Literata, Georgia, serif";
const EXTS: FileExt[] = ["PDF", "DOCX", "TXT", "MD", "RTF", "WEB"];
const SIZES: FileIconSize[] = ["sm", "md", "lg"];

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 34 }}>
      <MicroLabel style={{ display: "block", marginBottom: 14 }}>{label}</MicroLabel>
      {children}
    </div>
  );
}

function Row({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ThemeSection({ theme }: { theme: "dark" | "light" }) {
  const [sheet, setSheet] = useState<SheetVariant | null>(null);
  const [toastShown, setToastShown] = useState(true);
  const [retrying, setRetrying] = useState(false);

  return (
    <section
      data-theme={theme}
      style={{
        background: "var(--sn-bg)",
        color: "var(--sn-text)",
        fontFamily: "var(--font-space-grotesk), 'Space Grotesk', sans-serif",
        padding: "clamp(18px,2.4vw,28px) clamp(14px,2vw,26px) 60px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(18px,2vw,21px)",
            fontWeight: 400,
            margin: 0,
          }}
        >
          {theme === "dark" ? "Dark (default)" : "Light"}
        </h2>
        <MicroLabel>THEME SECTION · SCOPED VIA DATA-THEME</MicroLabel>
      </div>

      <Block label="BUTTONS — PRIMARY / GHOST / DANGER / LINK / TINY">
        <Row>
          <PrimaryButton>
            <SparkIcon size={14} />
            New briefing
          </PrimaryButton>
          <PrimaryButton size="sm">
            <SparkIcon size={14} />
            Use in briefing
          </PrimaryButton>
          <PrimaryButton working workingLabel="Saving…">
            Save document
          </PrimaryButton>
          <PrimaryButton disabled>Generate briefing</PrimaryButton>
          <form
            action={async () => {
              // Demo of the useFormStatus path: the submit button below goes
              // working on its own while this action is pending.
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }}
          >
            <PrimaryButton workingLabel="Generating…">
              Generate briefing (form)
            </PrimaryButton>
          </form>
        </Row>
        <Row style={{ marginTop: 12 }}>
          <GhostButton>
            <ClockIcon size={13} />
            Audit trail
          </GhostButton>
          <GhostButton size="sm">
            <OpenIcon size={13} />
            Open
          </GhostButton>
          <GhostButton size="sm" working workingLabel="Signing out…">
            Sign out
          </GhostButton>
          <DangerButton>
            <TrashIcon size={13} />
            Delete
          </DangerButton>
          <DangerButton solid>Delete</DangerButton>
          <DangerButton solid working workingLabel="Deleting…">
            Delete
          </DangerButton>
          <LinkButton>Clear</LinkButton>
          <TinyLink>SESSION EXPIRED</TinyLink>
        </Row>
      </Block>

      <Block label="MICRO LABELS">
        <Row>
          <MicroLabel>RECENT DOCUMENTS</MicroLabel>
          <MicroFaint>DRAG FILES ANYWHERE HERE</MicroFaint>
          <MicroAccent>3 SELECTED</MicroAccent>
        </Row>
      </Block>

      <Block label="FILE ICONS — 6 TYPES × 3 SIZES, UNSELECTED THEN SELECTED">
        {SIZES.map((size) => (
          <div key={size} style={{ marginBottom: 16 }}>
            <MicroFaint style={{ display: "block", marginBottom: 8 }}>
              {size.toUpperCase()}
            </MicroFaint>
            <Row>
              {EXTS.map((ext) => (
                <FileIcon key={ext} ext={ext} size={size} />
              ))}
              <span style={{ width: 10 }} />
              {EXTS.map((ext) => (
                <FileIcon key={`${ext}-sel`} ext={ext} size={size} selected />
              ))}
            </Row>
          </div>
        ))}
      </Block>

      <Block label="LOADING — BRIEFING CARD + DOCUMENT TILE SKELETONS">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(304px,1fr))",
            gap: "clamp(14px,1.8vw,22px)",
          }}
        >
          <BriefingCardSkeleton />
          <BriefingCardSkeleton />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(134px,1fr))",
            gap: "clamp(12px,1.6vw,20px)",
            marginTop: 18,
            maxWidth: 640,
          }}
        >
          <DocTileSkeleton />
          <DocTileSkeleton />
          <DocTileSkeleton />
        </div>
      </Block>

      <Block label="ERROR ≠ EMPTY">
        <ErrorBox
          title="We couldn't load your briefings."
          body="The connection dropped. Nothing has been lost."
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            setTimeout(() => setRetrying(false), 900);
          }}
        />
        <EmptyBox
          title="No briefings yet."
          body="Select documents below and Signal Notes will read only those."
        >
          <PrimaryButton>
            <SparkIcon size={14} />
            New briefing
          </PrimaryButton>
        </EmptyBox>
      </Block>

      <Block label="SHEET — SCRIM CLICK OR ESCAPE CLOSES">
        <Row>
          {(["default", "doc", "brief", "narrow"] as const).map((variant) => (
            <GhostButton key={variant} size="sm" onClick={() => setSheet(variant)}>
              Open {variant} sheet
            </GhostButton>
          ))}
        </Row>
        {sheet ? (
          <Sheet
            variant={sheet}
            onClose={() => setSheet(null)}
            aria-label={`${sheet} sheet demo`}
          >
            <div
              style={{
                padding: "24px clamp(20px,3vw,30px) 28px",
                // The brief variant is transparent by design; give the demo
                // content the paper card the real briefing sheet brings.
                background: sheet === "brief" ? "var(--sn-card)" : "transparent",
                borderRadius: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <h1
                  style={{
                    fontFamily: SERIF,
                    fontSize: "clamp(20px,2.4vw,24px)",
                    fontWeight: 400,
                    margin: 0,
                    color: "var(--sn-text)",
                  }}
                >
                  {sheet} sheet
                </h1>
                <SheetCloseButton onClose={() => setSheet(null)} />
              </div>
              <p
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: "var(--sn-muted)",
                  margin: "9px 0 0",
                }}
              >
                Max width {sheet === "brief" ? 1080 : sheet === "doc" ? 960 : sheet === "narrow" ? 460 : 740}
                px · radius 16 · rises with sn-rise. Click the scrim or press
                Escape to close.
              </p>
            </div>
          </Sheet>
        ) : null}
      </Block>

      <Block label="TOAST">
        <Row>
          <GhostButton size="sm" onClick={() => setToastShown((s) => !s)}>
            Toggle toast
          </GhostButton>
        </Row>
        {toastShown ? <Toast>acme-discovery-0812.pdf added</Toast> : null}
      </Block>

      <Block label="ICONS — FULL CANVAS SET">
        <Row style={{ gap: 18 }}>
          {(
            [
              ["mark", <MarkIcon key="i" />],
              ["search", <SearchIcon key="i" />],
              ["plus", <PlusIcon key="i" />],
              ["spark", <SparkIcon key="i" />],
              ["chev", <ChevIcon key="i" />],
              ["close", <CloseIcon key="i" />],
              ["check", <CheckIcon key="i" />],
              ["trash", <TrashIcon key="i" />],
              ["open", <OpenIcon key="i" />],
              ["clock", <ClockIcon key="i" />],
              ["note", <NoteIcon key="i" />],
              ["retry", <RetryIcon key="i" />],
              ["edit", <EditIcon key="i" />],
              ["up", <ThumbUpIcon key="i" />],
              ["down", <ThumbDownIcon key="i" />],
              ["upload", <UploadIcon key="i" />],
              ["sun", <SunIcon key="i" />],
              ["moon", <MoonIcon key="i" />],
            ] as const
          ).map(([name, node]) => (
            <span
              key={name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              {node}
              <MicroFaint>{name.toUpperCase()}</MicroFaint>
            </span>
          ))}
        </Row>
      </Block>
    </section>
  );
}

export function DesignGallery() {
  const { theme, toggleTheme } = useTheme();

  return (
    <main style={{ flex: 1 }}>
      <div
        style={{
          background: "var(--sn-head)",
          borderBottom: "1px solid var(--sn-border)",
          padding: "0 clamp(14px,2vw,26px)",
          height: 62,
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: "var(--sn-text)",
          fontFamily: "var(--font-space-grotesk), 'Space Grotesk', sans-serif",
        }}
      >
        <MarkIcon />
        <span style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "-.01em" }}>
          Signal Notes
        </span>
        <MicroLabel>DESIGN GALLERY · P2 SCREENSHOT TARGET · DELETED IN P5 HARDENING</MicroLabel>
        <span style={{ flex: 1 }} />
        <GhostButton onClick={toggleTheme}>
          {theme === "dark" ? <SunIcon size={13} /> : <MoonIcon size={13} />}
          {theme === "dark" ? "Light" : "Dark"}
        </GhostButton>
      </div>
      <ThemeSection theme="dark" />
      <ThemeSection theme="light" />
    </main>
  );
}
