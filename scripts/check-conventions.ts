/**
 * check-conventions.ts — the three constitution rules that used to be WARNings.
 *
 * R3b, R3c and R5b shipped as `say "WARN" "... auditor must confirm each one"`.
 * Nobody confirms anything in CI, so in practice all three passed silently:
 * the gate carried its own escape hatch. This script closes it.
 *
 * Two changes make that possible:
 *
 *   1. R3b is now a real check instead of a line-grep. It used to test whether
 *      the word "error" appeared on the SAME LINE as a write call, which for
 *      ordinary multi-line Supabase chains is almost never true — it reported
 *      21 "unconfirmed" writes, every one of them correctly checked on the
 *      statement's first line. It now reads the whole statement.
 *
 *   2. Judgement calls are RECORDED, not deferred. A hit that a human has
 *      confirmed is fine lives in docs/constitution-exceptions.json with a
 *      written reason. Anything not on that list fails the build, and an entry
 *      on the list that no longer matches anything also fails — so the file
 *      cannot rot into a blanket amnesty.
 *
 * Usage: npx tsx scripts/check-conventions.ts [--list]
 *   --list prints the current hits as exception-file entries, to make
 *   recording a NEW confirmed exception a copy-paste rather than a guess.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_DIRS = ["app", "components", "lib"];
const R5B_DIRS = ["lib/ai", "app/api"];
const EXCEPTIONS_PATH = "docs/constitution-exceptions.json";

type Hit = { rule: string; file: string; signature: string; context: string };
type Exception = { file: string; signature: string; reason: string };
type ExceptionFile = Record<string, Exception[]>;

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(relative(process.cwd(), full));
  }
  return out;
}

/** Collapse whitespace so a signature survives reformatting. */
function signature(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

// ---------------------------------------------------------------------------
// R3b — every Supabase write checks its { error }
//
// For each write call we extract the ENCLOSING STATEMENT (walking out to the
// surrounding statement boundaries, respecting nesting) and ask whether that
// statement binds `error`. That is what the rule always meant.
// ---------------------------------------------------------------------------

const WRITE_CALL = /\.(insert|update|upsert|delete)\s*\(/g;

function statementSpan(src: string, at: number): string {
  // Backwards to the statement start: the nearest ';' '{' or '}' seen at the
  // same nesting level we started from.
  let depth = 0;
  let start = 0;
  for (let i = at; i >= 0; i--) {
    const c = src[i];
    if (c === ")" || c === "]" || c === "}") depth++;
    else if (c === "(" || c === "[" || c === "{") {
      if (depth === 0 && c === "{") { start = i + 1; break; }
      depth--;
    } else if (c === ";" && depth === 0) { start = i + 1; break; }
  }
  // Forwards to the end of the statement.
  depth = 0;
  let end = src.length;
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) { end = i; break; }
      depth--;
    } else if (c === ";" && depth === 0) { end = i; break; }
  }
  return src.slice(start, end);
}

function findR3b(files: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    WRITE_CALL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WRITE_CALL.exec(src)) !== null) {
      const span = statementSpan(src, m.index);
      // Only Supabase writes: every one of them chains off .from(). This is
      // what keeps Set#delete / Map#delete out of the results.
      if (!/\.from\s*\(/.test(span)) continue;
      if (/\berror\b/.test(span)) continue; // checked — the common case
      const line = src.slice(0, m.index).split("\n").length;
      hits.push({
        rule: "R3b",
        file,
        signature: signature(span),
        context: `${file}:${line}`,
      });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// R3c — catch blocks whose body is only comments still swallow the error.
// Each must be a confirmed, recorded pattern with a stated backstop.
// ---------------------------------------------------------------------------

const EMPTYISH_CATCH =
  /catch\s*(?:\([^)]*\))?\s*\{((?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*)\}/g;

function findR3c(files: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    EMPTYISH_CATCH.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EMPTYISH_CATCH.exec(src)) !== null) {
      const line = src.slice(0, m.index).split("\n").length;
      hits.push({
        rule: "R3c",
        file,
        signature: signature(m[1] || "(no comment at all)"),
        context: `${file}:${line}`,
      });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// R5b — model-facing instruction strings must live in lib/prompts/ (rule 5),
// not loose in the engine or the route handlers.
// ---------------------------------------------------------------------------

const PROMPT_SHAPED =
  // [^"\n]* — NOT [^"]*: this scans whole files, so a dot-all-ish character
  // class would happily match from one string's closing quote across newlines
  // to the next string's opening quote and report the span between them.
  /"[^"\n]*(you may|you just|you wrote|resubmit|call [a-z_]+ with|do not (?:read|include)|only read|source set)[^"\n]*"/gi;

function findR5b(files: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    PROMPT_SHAPED.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PROMPT_SHAPED.exec(src)) !== null) {
      const line = src.slice(0, m.index).split("\n").length;
      hits.push({ rule: "R5b", file, signature: signature(m[0]), context: `${file}:${line}` });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const allFiles = SRC_DIRS.flatMap((d) => walk(d));
const r5bFiles = R5B_DIRS.flatMap((d) => walk(d));

const hits: Hit[] = [...findR3b(allFiles), ...findR3c(allFiles), ...findR5b(r5bFiles)];

if (process.argv.includes("--list")) {
  const grouped: ExceptionFile = {};
  for (const h of hits) {
    (grouped[h.rule] ??= []).push({
      file: h.file,
      signature: h.signature,
      reason: "TODO: why this is correct, and what the backstop is",
    });
  }
  console.log(JSON.stringify(grouped, null, 2));
  process.exit(0);
}

const exceptions: ExceptionFile = existsSync(EXCEPTIONS_PATH)
  ? (JSON.parse(readFileSync(EXCEPTIONS_PATH, "utf8")) as ExceptionFile)
  : {};

const isExcepted = (h: Hit) =>
  (exceptions[h.rule] ?? []).some(
    (e) => e.file === h.file && e.signature === h.signature
  );

const violations = hits.filter((h) => !isExcepted(h));

// An exception that no longer matches anything is stale: it either got fixed
// (good — delete the entry) or the code moved out from under it (in which case
// the confirmation no longer applies to what is actually there now).
const stale: { rule: string; file: string; reason: string }[] = [];
for (const [rule, entries] of Object.entries(exceptions)) {
  for (const e of entries) {
    const matched = hits.some(
      (h) => h.rule === rule && h.file === e.file && h.signature === e.signature
    );
    if (!matched) stale.push({ rule, file: e.file, reason: e.reason });
  }
}

let failed = false;

for (const rule of ["R3b", "R3c", "R5b"]) {
  const ruleViolations = violations.filter((v) => v.rule === rule);
  const excepted = hits.filter((h) => h.rule === rule && isExcepted(h)).length;
  if (ruleViolations.length === 0) {
    const suffix = excepted > 0 ? ` (${excepted} recorded exception${excepted === 1 ? "" : "s"})` : "";
    console.log(`PASS   ${rule}${suffix}`);
  } else {
    failed = true;
    console.log(`FAIL   ${rule}: ${ruleViolations.length} unconfirmed hit(s)`);
    for (const v of ruleViolations) {
      console.log(`       ${v.context}`);
      console.log(`         ${v.signature}`);
    }
  }
}

if (stale.length > 0) {
  failed = true;
  console.log(`FAIL   stale exception(s) in ${EXCEPTIONS_PATH} matching nothing:`);
  for (const s of stale) console.log(`       [${s.rule}] ${s.file} — ${s.reason}`);
}

if (failed) {
  console.log(
    `\nEach hit is either a defect to fix, or a judgement call to RECORD in ${EXCEPTIONS_PATH}\n` +
      `with a written reason. \`npx tsx scripts/check-conventions.ts --list\` prints the entries.`
  );
}

process.exit(failed ? 1 : 0);
