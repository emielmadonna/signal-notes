"use client";

// Workspace header, h62 (DESIGN-SPEC §2; every value from the canvas
// renderVals(): headerStyle, searchWrap/searchInput, themeBtn, primaryBtn,
// quickMenu/quickFoot/quickGen, accountBtn/avatarStyle/orgLine, accountMenu/
// menuHead/menuSection/menuRowActive/menuBtn).
//
// - Search is a controlled input; the query state lives in the parent so P3
//   can filter both sections from it.
// - The QUICK MENU's document rows come from the QuickDoc props interface;
//   P2 passes an empty list (P3 supplies the 4 recent docs), so the menu
//   renders its head + footer with zero rows — structure and animation only.
// - NO account-switching row (spec §5 D3: cut — one org per user).
import { useState, type CSSProperties } from "react";
import { useTheme } from "@/components/theme-provider";
import { GhostButton, LinkButton, PrimaryButton } from "@/components/ui-sn/buttons";
import { FileIcon, type FileExt } from "@/components/ui-sn/file-icon";
import {
  CheckIcon,
  ChevIcon,
  MarkIcon,
  MoonIcon,
  SearchIcon,
  SparkIcon,
  SunIcon,
} from "@/components/ui-sn/icons";
import { MicroAccent, MicroLabel } from "@/components/ui-sn/micro";

const SERIF = "var(--font-literata), Literata, Georgia, serif";
const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

export type QuickDoc = {
  id: string;
  name: string;
  ext: FileExt | (string & {});
  selected: boolean;
  onToggle: () => void;
};

export function WorkspaceHeader({
  email,
  displayName,
  initials,
  orgName,
  orgError,
  query,
  onQueryChange,
  quickDocs = [],
  signOutAction,
  onAllDocuments,
}: {
  email: string;
  displayName: string;
  initials: string;
  /** Real org name from the server fetch; null when the fetch failed. */
  orgName: string | null;
  /** Human-readable org fetch failure, surfaced in the menu (rule 3 spirit). */
  orgError: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  /** P3's 4 recent documents; P2 passes the placeholder-empty default. */
  quickDocs?: QuickDoc[];
  /** Server action reusing the existing sign-out logic. */
  signOutAction: () => Promise<void>;
  /** Footer "All documents" link target (scrolls to the section). */
  onAllDocuments: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const [quickOpen, setQuickOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const selectedCount = quickDocs.filter((d) => d.selected).length;

  const quickMenu: CSSProperties = {
    position: "absolute",
    right: 0,
    top: "calc(100% + 2px)",
    width: "min(330px,90vw)",
    background: "var(--sn-sheet)",
    border: "1px solid var(--sn-border)",
    borderRadius: 14,
    boxShadow: "var(--sn-menu-shadow)",
    zIndex: 60,
    overflow: "hidden",
    transformOrigin: "top right",
    maxHeight: quickOpen ? 440 : 0,
    opacity: quickOpen ? 1 : 0,
    transform: `translateY(${quickOpen ? "0" : "-4px"}) scale(${quickOpen ? "1" : ".97"})`,
    pointerEvents: quickOpen ? "auto" : "none",
    transition:
      "max-height .38s cubic-bezier(.32,.72,0,1),opacity .3s cubic-bezier(.32,.72,0,1),transform .38s cubic-bezier(.32,.72,0,1)",
    transitionDelay: quickOpen ? ".11s,.11s,.11s" : "0s",
  };

  return (
    <header
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 clamp(14px,2vw,26px)",
        height: 62,
        borderBottom: "1px solid var(--sn-border)",
        background: "var(--sn-head)",
        position: "relative",
        zIndex: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        <span style={{ display: "flex" }}>
          <MarkIcon />
        </span>
        <span
          style={{
            fontFamily: SERIF,
            fontSize: 17,
            letterSpacing: "-.01em",
            whiteSpace: "nowrap",
          }}
        >
          Signal Notes
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 8 }} />

      {/* Search pill — controlled; P3 filters both sections from this. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 34,
          padding: "0 14px",
          borderRadius: 100,
          border: "1px solid var(--sn-border)",
          background: "transparent",
          color: "var(--sn-faint)",
          width: "clamp(180px,26vw,320px)",
        }}
      >
        <SearchIcon size={13} />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search briefings and documents…"
          aria-label="Search briefings and documents"
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 0,
            background: "transparent",
            color: "var(--sn-text)",
            font: `400 12.5px ${SANS}`,
          }}
        />
      </div>

      {/* Theme toggle: shows the theme you would switch TO (canvas). */}
      <GhostButton type="button" onClick={toggleTheme}>
        {theme === "dark" ? <SunIcon size={13} /> : <MoonIcon size={13} />}
        {theme === "dark" ? "Light" : "Dark"}
      </GhostButton>

      {/* New briefing + QUICK MENU on hover. The padding-bottom/-margin trick
          (canvas) keeps the hover alive across the 2px gap to the menu. */}
      <div
        onMouseEnter={() => setQuickOpen(true)}
        onMouseLeave={() => setQuickOpen(false)}
        style={{
          position: "relative",
          flex: "none",
          paddingBottom: 8,
          marginBottom: -8,
        }}
      >
        {/* Canvas onClick opens the composer (P3). Until it exists the click
            toggles the quick menu — real behavior (touch devices included),
            not a dead accent button. */}
        <PrimaryButton
          type="button"
          onClick={() => setQuickOpen((open) => !open)}
        >
          <SparkIcon size={14} />
          New briefing
        </PrimaryButton>
        <div style={quickMenu} aria-hidden={!quickOpen}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "13px 16px 10px",
            }}
          >
            <MicroLabel>RECENT DOCUMENTS</MicroLabel>
            <MicroAccent>{selectedCount} SELECTED</MicroAccent>
          </div>
          {quickDocs.slice(0, 4).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={d.onToggle}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                width: "100%",
                padding: "8px 16px",
                border: 0,
                background: d.selected ? "var(--sn-hover-bg)" : "transparent",
                color: "var(--sn-text)",
                cursor: "pointer",
                transition: "background .14s",
              }}
            >
              <FileIcon ext={d.ext} size="sm" selected={d.selected} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: "left",
                  fontSize: 12.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {d.name}
              </span>
              <span
                style={{
                  width: 17,
                  height: 17,
                  flex: "none",
                  borderRadius: 100,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9.5,
                  border: `1px solid ${d.selected ? "var(--sn-accent)" : "var(--sn-border)"}`,
                  background: d.selected ? "var(--sn-accent)" : "transparent",
                  color: "var(--sn-on-accent)",
                }}
              >
                {d.selected ? "✓" : ""}
              </span>
            </button>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "11px 16px 13px",
              borderTop: "1px solid var(--sn-soft)",
              marginTop: 6,
            }}
          >
            {/* Canvas quickGen at zero selection: soft bg, faint text. */}
            <button
              type="button"
              disabled={selectedCount === 0}
              style={{
                height: 30,
                padding: "0 15px",
                borderRadius: 100,
                border: 0,
                background:
                  selectedCount > 0 ? "var(--sn-accent)" : "var(--sn-soft)",
                color:
                  selectedCount > 0
                    ? "var(--sn-on-accent)"
                    : "var(--sn-faint)",
                font: `600 11.5px ${SANS}`,
                cursor: selectedCount > 0 ? "pointer" : "not-allowed",
              }}
            >
              Generate briefing
            </button>
            <LinkButton type="button" onClick={onAllDocuments}>
              All documents
            </LinkButton>
          </div>
        </div>
      </div>

      {/* Account button + menu. Click toggles; leaving the wrapper closes. */}
      <div
        onMouseLeave={() => setAccountOpen(false)}
        style={{ position: "relative", flex: "none" }}
      >
        <button
          type="button"
          onClick={() => {
            setAccountOpen((open) => !open);
            setQuickOpen(false);
          }}
          aria-expanded={accountOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            height: 40,
            padding: "0 12px 0 5px",
            borderRadius: 100,
            border: `1px solid ${accountOpen ? "var(--sn-border)" : "transparent"}`,
            background: accountOpen ? "var(--sn-hover-bg)" : "transparent",
            color: "var(--sn-text)",
            cursor: "pointer",
            transition: "border-color .16s,background .16s",
            fontFamily: SANS,
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 100,
              background: "var(--sn-avatar-bg)",
              color: "var(--sn-text)",
              fontFamily: MONO,
              fontSize: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "none",
            }}
          >
            {initials}
          </span>
          <span style={{ textAlign: "left", lineHeight: 1.2 }}>
            <span style={{ display: "block", fontSize: 12.5, whiteSpace: "nowrap" }}>
              {displayName}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: ".1em",
                color: "var(--sn-faint)",
                whiteSpace: "nowrap",
              }}
            >
              {orgName ?? "WORKSPACE UNAVAILABLE"}
            </span>
          </span>
          <ChevIcon size={12} color="var(--sn-muted)" />
        </button>
        {accountOpen ? (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 6px)",
              width: 256,
              background: "var(--sn-sheet)",
              border: "1px solid var(--sn-border)",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "var(--sn-menu-shadow)",
              animation: "sn-rise .16s ease both",
              zIndex: 60,
            }}
          >
            <div style={{ padding: "13px 15px", borderBottom: "1px solid var(--sn-soft)" }}>
              <MicroLabel style={{ display: "block" }}>SIGNED IN AS</MicroLabel>
              <div style={{ fontSize: 12.5, marginTop: 5 }}>{email}</div>
            </div>
            <div style={{ padding: "9px 0", borderBottom: "1px solid var(--sn-soft)" }}>
              <MicroLabel style={{ display: "block", padding: "0 15px 6px" }}>
                WORKSPACE
              </MicroLabel>
              {orgName ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 15px",
                    fontSize: 12.5,
                    background: "var(--sn-hover-bg)",
                  }}
                >
                  {orgName}
                  <CheckIcon size={13} color="var(--sn-accent)" />
                </div>
              ) : (
                // The org fetch failed on the server; say so, honestly.
                <div
                  role="alert"
                  style={{
                    padding: "9px 15px",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "var(--sn-danger)",
                  }}
                >
                  Couldn&apos;t load your workspace
                  {orgError ? `: ${orgError}` : "."}
                </div>
              )}
              {/* NO account-switching row — spec §5 D3 (Emiel cut it). */}
            </div>
            <form action={signOutAction}>
              {/* ui-sn button (rule 10 working state) restyled to the flat
                  menuBtn row from the canvas. */}
              <GhostButton
                workingLabel="Signing out…"
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  textAlign: "left",
                  height: "auto",
                  padding: "11px 15px",
                  border: 0,
                  borderRadius: 0,
                }}
              >
                Sign out
              </GhostButton>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
