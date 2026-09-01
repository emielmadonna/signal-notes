# MOCK-WREN — Round 2 (day-before rehearsal)

> Second adversarial rehearsal. Round 1 (deliverables/MOCK-WREN-ROUND-1.md) found
> four things — (1) a dead evidence pointer on the flagship catch #4, (2) D05
> overselling a WARN as a machine block, (3) D10/SHIPLOG §3 inventing a rule
> tension, (4) unchecked SHIPLOG R2/R3 boxes — all reportedly FIXED. Round 2's job:
> VERIFY the fixes are real, then hunt for anything new or newly-introduced.
> Played both sides: Q as Wren, A as the best the repo supports, GRADE honest.
>
> **Headline: the round-1 fixes all HOLD — but the generalized fix (the promised
> dead-pointer sweep) did NOT actually run across the decision cards. D07 cites an
> evidence file that never existed, and the 11:18:33 stream line claims "Zero dead
> pointers now." That is the new top risk, and it is the exact class round 1 was
> about.**

---

## 1. Dead-pointer attack, re-run against EVERY cited file

Method: extracted every `*.txt` / `*.png` / evidence-path token from SHIPLOG.md,
docs/catch-log.md, all ten docs/decisions/D*.md, deliverables/PART-C.md and
PART-B.md, then `test -f` each (resolving bare names into shiplog/evidence/).

**Result: NOT dead-pointer-free. One live dead pointer on a decision card, plus
one transient reference in the raw catch log.**

### FINDING R2-1 (NEW / SURVIVOR) — D07 cites an evidence file that never existed

- **`docs/decisions/D07-audit-trail-pinned-and-survives-deletion.md` line 27:**
  > "Proof: two-org probe 24/24 (`r1-probe-20260901-042430.txt`); …"
- `test -f shiplog/evidence/r1-probe-20260901-042430.txt` → **404.**
- `git log --all --diff-filter=A` for that path → **empty. The file never existed
  in history at all** (not renamed, not gitignored — never created). The nearest
  real files are `-042401.txt` and `-042448.txt`, and even `-042448.txt` is
  **gitignored** (`git check-ignore` confirms), i.e. a transient per-run copy.
- The canonical, committed, correct artifact is **`r1-probe-final-24checks.txt`**
  — which D01 cites correctly and which does contain the 24/24 run. D07 should
  point there. Instead it invented a timestamp (`042430`) that splits the
  difference between two real timestamps and matches neither.

**Why this is the whole ballgame this round:** it is the *identical failure class*
round 1 flagged as the #1 credibility risk ("show me the file" → 404 on a card),
it is on a **decision card** (a primary walkthrough artifact), and it directly
falsifies two freshly-made claims:
- catch-log.md #20's stated standing rule: *"no claim may cite a file that doesn't
  exist"* (the fix declared in response to round 1).
- docs/stream.md **11:18:33**: *"**Zero dead pointers now.**"*

If Wren re-runs her signature move on D07 — the very card about the audit trail's
trustworthiness — it 404s, moments after the team asserted a sweep guaranteeing it
can't. That contradiction does more damage than the original round-1 pointer,
because it reads as "they said they fixed the class and didn't."

**Fix (2 min):** repoint D07 L27 to `r1-probe-final-24checks.txt` (same file D01
uses), and actually run the sweep this doc just ran before calling it done.

### FINDING R2-2 (MINOR) — catch-log #11 cites a transient CI artifact that isn't present

- `docs/catch-log.md` line 135 (Catch #11 narrative) names
  `r1-probe-20260901-101617.txt` — `test -f` → 404, and it's the gitignored
  transient class. Severity is low: it's raw historical narration of a CI failure,
  not a headline claim or a card, and the point it illustrates (env-loader death on
  clean checkout) is corroborated by the GitHub run IDs cited on the same line.
  Still technically a dead pointer; either drop the filename or repoint to a saved
  copy.

### Everything else resolves

All load-bearing evidence is present AND git-tracked: the flagship
`r4-wrong-project-migrations.txt`, `r4-wrong-project-tables-20260901.txt`,
`r1-probe-final-24checks.txt`, both `constitution-…023502/…025459.txt`, the
migration-verified pastes, and every SHIPLOG PNG (`p4-live/citation-tooltip.png`,
`generation-complete.png`, etc. — all in `shiplog/evidence/p4-live/`). Bare
source-file names in the catch log (`signin-form`, `section-state`, `anthropic.ts`)
resolve to real files (some at slightly different paths, e.g. `app/signin/…`) and
are inline code references with line numbers, not evidence pointers.

---

## 2. Catch #4 evidence file — exists, and is it honest?

**Q (Wren):** Round 1 said the 300-migration number had no artifact. You created
`r4-wrong-project-migrations.txt` overnight. Convince me you didn't just backfill
a precise number you can't actually back.

**A:** The file exists (2426 bytes, git-tracked) and it is written to *avoid* the
false precision that would have been the easy cheat:
- The count is stated as **"several hundred … on the order of 300"** — explicitly
  NOT a precise figure, with a stated reason: *"the exact number was not separately
  re-counted and this project is now pinned OUT of reach (by design), so it cannot
  be re-queried to confirm a precise figure."*
- It quotes a **verbatim real head** of the migration list (six versions,
  `20260424000000 | baseline_branch_extensions` … `feature_events`) rather than a
  round invented total.
- It names **`r4-wrong-project-tables-20260901.txt` as "the load-bearing proof …
  That file, not this summary"** — pointing the weight at the 79 KB raw
  `list_tables` dump that actually shows the foreign `organizations` table, which
  is the real collision proof.

**GRADE — HOLDS, and it's a model of the honest move.** It does exactly what round
1 asked (no false precision, real head quoted, tables file named as load-bearing).
One nuance to rehearse, not a defect: "~300" now lives in three places with three
slightly different hedges — SHIPLOG §2 catch 1 says "~300 applied migrations,"
the file says "on the order of 300," catch-log #4 says "~300." That's consistent,
but be ready to say plainly: *"the number is approximate on purpose; the exact,
complete artifact is the tables dump."* Don't let "~300" get quoted back as if it
were presented as exact.

---

## 3. Are the D05 / SHIPLOG §3 concessions real or cosmetic?

### D05 (WARN-not-FAIL) — REAL

D05 now leads with a bolded **"HONEST SCOPE (say this before Wren does): R5b is a
WARN, not a hard FAIL,"** and states the honest claim is *"the class is now
surfaced on every run and must be dispositioned,"* not *"the machine auto-blocks
it."* Verified against source: `scripts/constitution.sh` L76 emits
`say "WARN" "R5b …"`, L79 the PASS — no FAIL path for R5b. The card even carries
the concession into its pushback section ("it's a WARN by design"). This is a real
scope-down, not a cosmetic word swap — the exact overclaim round 1 named
("caught by the machine, not just by eye") is gone, replaced by "the miss can't
hide behind a silent green again." **HOLDS.**

### SHIPLOG §3 (optimistic-with-rollback) — REAL

§3 now opens: *"the honest concession … rule 10 done correctly means
optimistic-WITH-rollback … there's no contradiction, and our real defect wasn't
the rule: it was ONE un-awaited feedback upsert."* That is precisely the ground
round 1 said had to be given. The residual claim is now correctly narrow
(confirm-before-paint for *consequential* writes), and D10 mirrors it. The old
"deep rule-10-vs-rule-3 tension" framing is retired. **HOLDS** — concession is
substantive, not cosmetic.

### SHIPLOG §1 R2 / R3 boxes — FILLED

Both are now `[x]` with the mechanical enforcement described (R2 greps for
`select("*")`/empty select and FAILs with file:line; R3 FAILs empty catch,
R3b/R3c WARN for auditor disposition, plus the P5 forced-failure PNGs). No
placeholder dangling filenames remain in §1. **HOLDS.**

---

## 4. Two fresh angles, pushed to the honest limit

### Angle A — the citation-verification substring check (R6 / D04)

**Q (Wren):** You keep saying "19/19 citations verified." Verified how? Show me the
check, and tell me what "verified" does NOT mean.

**A:** `lib/ai/generation.ts` `verifyCitations` (L282-305): for each citation it
does `normalizeForMatch(doc.body).includes(normalizeForMatch(c.quote))`, where
`normalizeForMatch` (L70) collapses whitespace to single spaces; a citation that
doesn't match is **filtered out and doesn't count** (`total` counts all,
`verified` counts survivors). So "verified" = *this exact passage appears
verbatim (modulo whitespace) in the named source, else it's dropped and never
stored.* D04/R6 word it accurately as "a genuine substring," and the 7-of-9
CHECK line on the generation-complete screenshot proves the drop path fires (2
were discarded), which corroborates the mechanism rather than hiding it.

**Honest limit (where it runs out):**
1. **Substring presence ≠ semantic support.** The check proves the words exist in
   the source; it does NOT prove the quoted words support the sentence they're
   attached to. A model could lift a real, in-context-irrelevant fragment and it
   would count as "verified."
2. **Short/degenerate quotes pass trivially** — a two-word quote that happens to
   appear anywhere in the body verifies. The count rewards short quotes.
3. **Case-sensitive** (no `toLowerCase`) — a case-only mismatch is dropped. This
   errs safe (false-negative, not false-positive), so it's the good direction.

**GRADE — mechanism HOLDS and is honestly *worded*, but the honest limit is NOT on
the ASSUMED list.** SHIPLOG's ASSUMED section has entries for author names,
un-rate, optimistic rating, SSRF, disconnect, models, PDF markers — but nothing
saying *"citation verification is substring-presence, not evidence-of-claim."*
That's a real, undisclosed boundary on a rule (R6) the submission leans on for its
"glass box" story. **Recommend adding one ASSUMED bullet:** *"CITATION
VERIFICATION is a verbatim-substring check (unverified quotes dropped); it proves
the quoted words exist in the named source, not that they support the surrounding
claim, and very short quotes match trivially."* Cheap, and it converts a
findable gap into a pre-disclosed one — the submission's whole posture.

### Angle B — the model allowlist (D06)

**Q (Wren):** Three models in the picker; you told me last time only sonnet ran
live. Is that still true, and is there actually model-divergent code in the two
you never ran?

**A:** The allowlist is real and server-enforced: `lib/briefing-types.ts` L17-25
(`ALLOWED_MODELS` = sonnet-5/opus-5/haiku-4-5, `DEFAULT_MODEL`), `coerceModel`
L37 rejects anything off-list to the default, and `prepareGeneration`
(generation.ts L88) validates server-side so the client string is never trusted.
That's the security claim, and it's true. And yes — there IS divergent code on an
unexercised path: `lib/ai/anthropic.ts` L91-96 `thinkingConfig` branches
specifically on `model === "claude-haiku-4-5"` (explicit 4000-token budget vs
adaptive for the others). So haiku takes a genuinely different API shape that has
never been run end-to-end.

**Honest limit:** opus-5 and haiku-4-5 have never produced a briefing live; the
haiku thinking-config branch in particular is unexercised code on the core action.

**GRADE — HOLDS, and the limit IS pre-disclosed.** SHIPLOG ASSUMED: *"only
claude-sonnet-5 was exercised end-to-end live; the opus-5 and haiku-4-5 allowlist
paths are covered by types + server validation, not a live run each,"* and §4 item
4 ranks the fix (opus/haiku in CI on a schedule). This is the disclosure working
exactly as designed — the finding I *tried* to land is already written down. The
only discipline needed live: say "allowlist proven, model runs not" — never blur
them (same note as round 1, still valid).

**Contrast worth noting:** Angle A found an honest limit that is NOT on the ASSUMED
list (a real gap); Angle B found one that IS (the posture holding). One to fix, one
to keep doing.

---

## 5. Biggest remaining CREDIBILITY RISK (re-graded)

**The D07 dead pointer (R2-1), because of what surrounds it.** Round 1's flagship
risk was fixed *specifically* (catch #4's file), but the *class* wasn't closed: the
promised sweep didn't run over the decision cards, so D07 still 404s — and the
team has now gone on record (catch-log #20's standing rule + stream 11:18:33 "Zero
dead pointers now") saying the class is closed. A reviewer who finds a 404 right
after that claim doesn't just dock the one card; she re-opens the question "what
else did the sweep miss?" — the same contagion round 1 warned about, now with a
broken promise attached. It is a 2-minute fix (repoint to
`r1-probe-final-24checks.txt`) and it is the single thing standing between this
submission and "walkthrough-ready."

Runner-up: the undisclosed citation-substring limit (Angle A) — lower stakes, but
it's an ASSUMED-list omission on a headline rule, and this submission's entire
credibility rests on the ASSUMED list being complete.

---

## SCORECARD

### Did the round-1 fixes hold?

| # | Round-1 item | Held? |
|---|---|---|
| 1 | Dead pointer on catch #4 (`r4-wrong-project-migrations.txt`) | **YES** — file exists, tracked, honest ("~300", verbatim head, tables file named load-bearing) |
| 2 | D05 overselling WARN as machine block | **YES** — D05 leads with WARN-not-FAIL; matches constitution.sh L76 |
| 3 | D10 / SHIPLOG §3 invented rule tension | **YES** — §3 concedes optimistic-with-rollback up front; D10 mirrors it |
| 4 | SHIPLOG §1 R2/R3 unchecked boxes | **YES** — both `[x]`, mechanically backed, no dangling placeholders |
| — | Canonical committed probe (`r1-probe-final-24checks.txt`) | **YES** — present and git-tracked |
| ★ | **The GENERALIZED fix — "dead-pointer sweep, no claim cites a missing file"** | **NO** — sweep did not run over D-cards; **D07 L27 cites `r1-probe-20260901-042430.txt`, which never existed**, while stream 11:18:33 claims "Zero dead pointers now" |

### Biggest remaining risk
The **D07 dead pointer** (R2-1) — same failure class as round 1, on a decision
card, contradicting the just-declared "zero dead pointers" / "no claim cites a
missing file" guarantee. Higher reputational cost than the original because it
reads as a broken promise, not a first miss.

### New / newly-introduced findings this round
- **R2-1 (must-fix):** D07 L27 dead evidence pointer — `r1-probe-20260901-042430.txt`
  never existed; repoint to `r1-probe-final-24checks.txt`.
- **R2-2 (minor):** catch-log #11 L135 names transient `r1-probe-20260901-101617.txt`
  (404, gitignored class) — raw narrative only.
- **Angle-A gap (should-fix):** citation verification is substring-presence, not
  evidence-of-claim, and short quotes match trivially — **not on the ASSUMED
  list**; add one bullet.

### Walkthrough-ready?
**Not yet — but one 2-minute edit away.** The build's substance is strong and the
round-1 concessions are real, not cosmetic. But you cannot walk in having written
"Zero dead pointers now" while D07 404s on the audit-trail card — that is precisely
the "show me the file" trap, re-armed. **Before ready:** (1) repoint D07 L27 to
`r1-probe-final-24checks.txt`; (2) actually run the `test -f` sweep this doc ran,
across all D-cards + catch-log, and fix R2-2; (3) add the citation-substring ASSUMED
bullet. Do those three and it's ready. Rehearse-only (unchanged from round 1): lead
with the disclosure on D06 ("allowlist proven, runs not"), and say "~300 is
approximate on purpose; the tables dump is the exact artifact."
