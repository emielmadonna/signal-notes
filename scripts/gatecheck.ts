/**
 * gatecheck.ts — assembles the PROOF OF DONE section of a Change Card.
 *
 * Harness tooling (pre-go legal). Usage:
 *   npx tsx scripts/gatecheck.ts docs/cards/CHANGE-CARD-014.spec.json
 *
 * A card spec declares which rule checks apply to the change. gatecheck runs
 * every applicable check, saves evidence to shiplog/evidence/, and prints a
 * PROOF OF DONE block ready to paste into the card. Anything it cannot prove
 * is stamped UNPROVEN — and UNPROVEN defaults to reject.
 *
 * Screenshot checks (R3/R6/R8/R9/R10) use a headless browser against the
 * running dev server; they activate in P2+ once there is a UI to photograph.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type CheckResult = {
  rule: string;
  label: string;
  status: "PASS" | "FAIL" | "UNPROVEN";
  evidence: string; // pasted output or evidence filename
};

type CardSpec = {
  card: string;                 // "CHANGE-CARD-015"
  rules: string[];              // e.g. ["R2", "R3", "R10"]
  /**
   * The committed Playwright specs that photograph THIS card's surfaces.
   * This replaced a `screenshots: [{url, name, forceFailure}]` field whose
   * handler was a permanent `TODO(P2): drive headless chromium` stub — it
   * returned UNPROVEN unconditionally, so every UI rule on every card was
   * unprovable by construction. The e2e suite already drives a real browser
   * against the real app and writes its PNGs into shiplog/evidence/, so a
   * card now NAMES the specs that prove it and gatecheck runs them.
   */
  e2eSpecs?: string[];
};

const EVIDENCE_DIR = "shiplog/evidence";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function sh(cmd: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execSync(cmd, { encoding: "utf8", stdio: "pipe" }) };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    return { ok: false, out: (e.stdout ?? "") + (e.stderr ?? e.message) };
  }
}

function saveEvidence(name: string, content: string): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = join(EVIDENCE_DIR, `${name}-${stamp}.txt`);
  writeFileSync(file, content);
  return file;
}

/** Every rule the harness knows how to prove mechanically. */
const checks: Record<string, (spec: CardSpec) => CheckResult> = {
  R1: () => {
    if (!existsSync("scripts/two-org-probe.ts"))
      return { rule: "R1", label: "two-org probe", status: "UNPROVEN", evidence: "probe script not present yet (due end of P1)" };
    const r = sh("npx tsx scripts/two-org-probe.ts");
    const file = saveEvidence("r1-probe", r.out);
    return { rule: "R1", label: "two-org probe", status: r.ok ? "PASS" : "FAIL", evidence: file };
  },
  R2: () => {
    const r = sh(String.raw`grep -rnE '\.select\(\s*("\*"|'\''\*'\'')?\s*\)' app components lib 2>/dev/null; true`);
    const hits = r.out.trim();
    const file = saveEvidence("r2-selects", hits || "no wildcard/empty selects found");
    return { rule: "R2", label: "no wildcard/empty selects", status: hits ? "FAIL" : "PASS", evidence: file };
  },
  R4: () => {
    if (!process.env.DATABASE_URL)
      return { rule: "R4", label: "migrations verified live", status: "UNPROVEN", evidence: "DATABASE_URL not set" };
    const r = sh("bash scripts/constitution.sh"); // R4 section runs inside the verifier
    const applied = /R4 migration .* applied/.test(r.out);
    const ghost = /GHOST MIGRATION/.test(r.out);
    const file = saveEvidence("r4-migrations", r.out);
    return { rule: "R4", label: "migrations verified live", status: ghost ? "FAIL" : applied ? "PASS" : "UNPROVEN", evidence: file };
  },
  R5: () => {
    const r = sh(String.raw`grep -rnEi '(you are an?|system prompt|<\s*instructions)' app components lib 2>/dev/null | grep -v '^lib/prompts/'; true`);
    const hits = r.out.trim();
    const file = saveEvidence("r5-prompts", hits || "no prompt-shaped strings outside lib/prompts/");
    return { rule: "R5", label: "prompts only in lib/prompts/", status: hits ? "FAIL" : "PASS", evidence: file };
  },
  R7: () => {
    if (!process.env.DATABASE_URL)
      return { rule: "R7", label: "feedback row stored", status: "UNPROVEN", evidence: "DATABASE_URL not set" };
    const r = sh(`psql "$DATABASE_URL" -c "select id, briefing_id, rating, annotation, created_at from public.briefing_feedback order by created_at desc limit 3;"`);
    const file = saveEvidence("r7-feedback", r.out);
    return { rule: "R7", label: "feedback row stored", status: r.ok && /\(\d+ rows?\)/.test(r.out) && !/\(0 rows\)/.test(r.out) ? "PASS" : "UNPROVEN", evidence: file };
  },
  // R3, R6, R8, R9, R10 need the UI: headless-browser screenshots + recordings.
  // Wired in P2 once components exist; until then every card claiming them gets
  // an honest UNPROVEN and the Builder must attach manual screenshots instead.
  R3: (spec) => browserCheck("R3", "every write's error surfaced (forced-failure shots)", spec),
  R6: (spec) => browserCheck("R6", "grounding panel visible", spec),
  R8: (spec) => browserCheck("R8", "narrated generation, no bare spinner", spec),
  R9: (spec) => browserCheck("R9", "forced 500 renders error state, not empty", spec),
  R10: (spec) => browserCheck("R10", "working buttons + optimistic update", spec),
  // The three rules that used to be WARN-only in the verifier and are now a
  // real, exception-recorded gate (scripts/check-conventions.ts).
  R3b: () => conventionsCheck("R3b", "every Supabase write checks its { error }"),
  R3c: () => conventionsCheck("R3c", "no comment-only catch without a recorded backstop"),
  R5b: () => conventionsCheck("R5b", "no unversioned model-facing strings outside lib/prompts/"),
};

/** One shared run of the conventions checker, reported per rule. */
let conventionsRun: { ok: boolean; out: string; file: string } | null = null;
function conventionsCheck(rule: string, label: string): CheckResult {
  if (conventionsRun === null) {
    const r = sh("npx tsx scripts/check-conventions.ts");
    conventionsRun = { ...r, file: saveEvidence("conventions", r.out) };
  }
  const line = conventionsRun.out
    .split("\n")
    .find((l) => l.includes(` ${rule}`) || l.startsWith(`FAIL   ${rule}`));
  const passed = line?.trimStart().startsWith("PASS") ?? false;
  return { rule, label, status: passed ? "PASS" : "FAIL", evidence: conventionsRun.file };
}

/**
 * Runs the Playwright specs a card names. One run is shared across every
 * browser-backed rule on the card, because the specs are the same either way
 * and a card claiming four UI rules should not pay for four browser runs.
 */
let e2eRun: { ok: boolean; out: string; file: string; specs: string } | null = null;
function browserCheck(rule: string, label: string, spec: CardSpec): CheckResult {
  const specs = spec.e2eSpecs ?? [];
  if (specs.length === 0) {
    return {
      rule,
      label,
      status: "UNPROVEN",
      evidence:
        "the card names no e2eSpecs; add the Playwright spec(s) that photograph this surface, or attach manual evidence for the Auditor to reproduce",
    };
  }
  const key = specs.join(" ");
  if (e2eRun === null || e2eRun.specs !== key) {
    const r = sh(`npx playwright test ${specs.map((s) => JSON.stringify(s)).join(" ")}`);
    e2eRun = { ...r, file: saveEvidence("e2e", r.out), specs: key };
  }
  return {
    rule,
    label,
    status: e2eRun.ok ? "PASS" : "FAIL",
    evidence: `${e2eRun.file} (specs: ${key}; screenshots in shiplog/evidence/)`,
  };
}

// ---- main ----
const specPath = process.argv[2];
if (!specPath) {
  console.error("usage: npx tsx scripts/gatecheck.ts <card-spec.json>");
  process.exit(2);
}
const spec: CardSpec = JSON.parse(readFileSync(specPath, "utf8"));

// The verifier always runs; its report is evidence on every card.
const constitution = sh("bash scripts/constitution.sh");
const constitutionFile = saveEvidence("constitution-run", constitution.out);

const results: CheckResult[] = spec.rules.map((rule) => {
  const check = checks[rule];
  if (!check) return { rule, label: "unknown rule", status: "UNPROVEN", evidence: `no harness check registered for ${rule}` };
  return check(spec);
});

let block = `PROOF OF DONE (gatecheck ${stamp} — ${spec.card})\n`;
block += `  - [${constitution.ok ? "PASS" : "FAIL"}] npm run constitution — full report: ${constitutionFile}\n`;
for (const r of results) block += `  - [${r.status}] ${r.rule} ${r.label} — ${r.evidence}\n`;
if (results.some((r) => r.status === "UNPROVEN"))
  block += `  NOTE: UNPROVEN lines default to REJECT unless the Builder attached manual evidence the Auditor reproduced.\n`;

console.log(block);
process.exit(constitution.ok && results.every((r) => r.status !== "FAIL") ? 0 : 1);
