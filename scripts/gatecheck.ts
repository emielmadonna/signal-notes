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
  card: string;                 // "CHANGE-CARD-014"
  rules: string[];              // e.g. ["R2", "R3", "R10"]
  screenshots?: {               // UI proofs; require a running dev server
    url: string;                // page to load
    name: string;               // evidence file stem
    forceFailure?: string;      // route to force a 500 on before shooting
  }[];
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
  R3: (spec) => screenshotCheck("R3", "every write's error surfaced (forced-failure shots)", spec),
  R6: (spec) => screenshotCheck("R6", "grounding panel visible", spec),
  R8: (spec) => screenshotCheck("R8", "narrated generation, no bare spinner", spec),
  R9: (spec) => screenshotCheck("R9", "forced 500 renders error state, not empty", spec),
  R10: (spec) => screenshotCheck("R10", "working buttons + optimistic update", spec),
};

function screenshotCheck(rule: string, label: string, spec: CardSpec): CheckResult {
  const shots = spec.screenshots ?? [];
  if (shots.length === 0)
    return { rule, label, status: "UNPROVEN", evidence: "no screenshot spec provided; Builder must attach manual evidence" };
  // TODO(P2): drive headless chromium against the dev server, honoring
  // forceFailure routes, and save PNGs to shiplog/evidence/.
  return { rule, label, status: "UNPROVEN", evidence: "headless screenshot capture activates in P2" };
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
