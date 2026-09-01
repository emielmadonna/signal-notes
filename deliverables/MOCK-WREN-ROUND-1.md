# MOCK-WREN — Round 1 (rehearsal, ~30 min)

> Wren is T2D3's AI engineering partner running the Milestone 0 walkthrough.
> This is a REHEARSAL: Emiel is not here to answer live, so each item is played
> three ways — **Q (as Wren, relentless)**, **A (best defensible answer the repo
> actually supports, with the real file/evidence)**, and **GRADE (airtight, or
> fumble / bluff-risk?)**. The point is to find where the defense is thin BEFORE
> the real hour. Direct, evidence-hungry, allergic to vibes.

---

## Round 1 targets

- §A — the 3 weakest decisions (D-cards), attacked hard
- §B — the bluff probe (one question whose honest answer is "I didn't verify")
- §C — the "written after the fact?" probe on a SHIPLOG catch
- §D — the pushback rule argued from the other side
- §E — the Part B gap: honest boundary or dodge?
- §F — the single biggest credibility risk in the whole submission
- §G — SCORECARD

---

## §A — The three weakest decisions

I went down D01–D10 and picked the three softest to defend. They are **D05
(R5b)**, **D06 (model allowlist)**, and **D10 (optimistic updates)**. Reasons:
D01/D02/D03/D04/D07/D08 are backed by live probes, code, or committed FAIL→PASS
evidence and are hard to dent. The three below rest on a WARN heuristic, on
paths only reasoned-through, and on a self-admitted live race.

### A1 — D05: "prompts in one module, backed by R5b"

**Q (Wren):** Your own story is that R5 was GREEN while three model-facing
strings sat in the engine (catch #18). Your fix is R5b. I just read
`scripts/constitution.sh` L68–79 — R5b emits **WARN**, not FAIL. It's a regex
of hand-picked phrases (`resubmit|call x with|only read|source set|…`) that then
says "auditor must confirm each." So your answer to "a grep missed prompts" is…
a slightly bigger grep that doesn't even block the merge and hands the real
judgement back to a human. If catch #18 recurs with a phrase you didn't
enumerate, R5b is green and you're exactly where you started. Prove me wrong.

**A (best defensible):** R5b is deliberately a WARN, not a FAIL — a FAIL on a
fuzzy phrase-match would produce false positives on legitimate error strings and
tokens, which trains people to mute the gate. Its job is to *surface the class
to the auditor*, and the real backstop is the line-by-line adversarial read that
caught #18 in the first place (`lib/ai/anthropic.ts` 261-265, 289, 325). The
mechanical net got wider; the human net is still the primary. `verifyCitations`
and the org-scoped `read_document` tool are the load-bearing controls;
prompt-location is a maintainability/reviewability rule, and I'm honest that it's
enforced by convention + WARN + audit, not a hard mechanical proof.

**GRADE — FUMBLE RISK (medium).** The honest answer concedes the gate doesn't
block and is enumeration-based — which is the same failure class as the original
R5 miss, one abstraction up. D05's own tagline ("caught by the machine, not just
by eye") **oversells it**: the machine WARNs, the eye still decides. If Emiel/Wren
reads L76, the "backed by a mechanical check" framing wobbles. **Rehearse the
concession up front** — "R5b is a WARN that widens what the auditor sees, not a
merge-blocker; the real guarantee is the read" — instead of letting Wren find
L76 and make it look like a discovered overclaim.

### A2 — D06: "model allowlist, server-validated"

**Q (Wren):** You ship a picker with three models and claim the server rejects
anything off-list. But your own ASSUMED list says only `claude-sonnet-5` was
ever run end-to-end. So two of your three advertised models — opus-5, haiku-4-5
— have **never produced a briefing**. How do you know the tool-loop, the
citation verification, and the streaming don't fall over on opus's different
output shape? "Types + server validation" validates the *string*, not the *run*.
You're selling a picker two-thirds of which is unexercised.

**A (best defensible):** Correct, and it's on the ASSUMED list on purpose
(`SHIPLOG` §1, D06 honest-limit line) rather than hidden. What the allowlist
decision actually claims is narrow and true: `lib/briefing-types.ts` L17-28
(`ALLOWED_MODELS`, `coerceModel`) is the security boundary — a client can't
name an arbitrary/expensive/nonexistent model and have it hit the API, and the
chosen model is stored on the row for traceability. That's the decision. The
*coverage* gap (only sonnet exercised live) is a separate, disclosed risk, with
the fix already ranked in §4 item 4 (opus + haiku end-to-end in CI on a
schedule).

**GRADE — DEFENSIBLE, but only because it's pre-disclosed.** The security claim
(reject off-list strings) is real and code-backed. The weakness — 2 of 3 models
unexercised — is genuine, and the strength of the answer is entirely that it's
already written down as ASSUMED, not that the risk is small. **Bluff-risk is LOW
*if* he leads with the disclosure; HIGH if he tries to imply the picker is
proven.** Do not let "the allowlist works" blur into "the models work."

### A3 — D10: "optimistic updates vs await-before-paint"

(Attacked in full in §D — it's both a weak decision and the nominated pushback
rule.)

---

## §B — The bluff probe

**Q (Wren):** Client disconnects mid-generation on Vercel. Walk me through what
actually happens to the serverless function and the `generating` row — and tell
me how you *verified* it, not how you designed it.

**A (best defensible — the honest one):** I did **not** verify this under real
conditions. It's on the ASSUMED list verbatim: *"true Vercel serverless
freeze-on-disconnect semantics under load were reasoned through, not
stress-tested."* What I can stand behind with evidence: every event is persisted
to `generation_events` *before* it's forwarded to the stream (the DB is the
source of truth, the stream is best-effort — `lib/ai/generation.ts`,
events-replay route), and reopening replays from those rows. What I explicitly
cannot claim is that a serverless freeze can't strand a row in `generating`
forever — which is exactly why "background finalizer + real disconnect-under-load
test" is §4 item 2. The honest answer is "I don't know that it holds under load;
here's the durability I *did* prove, and here's the named gap."

**Is the honest answer actually documented?** Yes — SHIPLOG §1 ASSUMED,
"CLIENT-DISCONNECT DURABILITY" bullet, and §4 item 2. So the redirect-to-evidence
is real, not improvised.

**GRADE — AIRTIGHT *if answered honestly*; the trap is the temptation to
narrate the design as if it were a result.** The phrase to avoid is "the run
survives disconnect" said flatly — the repo only supports "the *persisted events*
survive; the freeze semantics are unproven." The material to say it cleanly is
already on the page. **This is the model of how the whole submission should
handle its soft spots** — name it, point at ASSUMED, point at the §4 fix. Bluff
risk LOW because the escape hatch is pre-written; the only way to fail this is to
get greedy.

---

## §C — "How do I know this wasn't written after the fact?"

**Target catch:** #4 / the R4 ghost-migration FAIL→PASS (the Part C anchor and
the most-repeated story in the whole submission).

**Q (Wren):** Your SHIPLOG opens with "nothing here is reconstructed after the
fact." But your decision cards, TOUR, and Part C were all committed at **11:08**
(commit `a116791`) — five hours after the build ended at 06:42. And the evidence
files you lean on (`constitution-20260901-023502.txt`, the FAIL; `-025459.txt`,
the PASS) have a filesystem mtime of **03:35**, not the 02:35 / 02:54 in their
names. So which is it — live diary, or a tidy reconstruction with backdated
filenames?

**A (best defensible):** Two different things, and the distinction holds. The
*deliverables* (Part C, decision cards, TOUR) are honestly late — they're §"P6/P7
drafts," written on top of the finished build, and the stream says so at 11:05.
Nobody claimed those were live. The *build evidence* is contemporaneous, and git
proves it independently of any mtime: `git log --diff-filter=A` shows
`constitution-20260901-023502.txt` (the R4 FAIL) first committed in `0268963` at
**02:54:03** and `-025459.txt` (the PASS) in `1a1ae7f` at **02:56:45**. The
content is exactly what Part C quotes — FAIL "GHOST MIGRATION … no tracking row",
then PASS "migration 20260901000001 applied." The 03:35 mtime is a red herring:
that's when P1 merged to main (`9bf9329`/`a29e436`, 03:35:52) and the checkout
rewrote working-tree mtimes — it can't rewrite the commit timestamp that already
recorded the file at 02:54. So: git commit time (which I can't backdate without
rewriting history the reviewer can check) is the real clock, and it lands inside
the build window.

**GRADE — AIRTIGHT on the build evidence, and the answer is *strengthened* by
conceding the deliverables were late.** The git `--diff-filter=A` timestamp is
the exact right thing to reach for and it independently corroborates the SHIPLOG.
**One caveat to rehearse:** don't overstate the "nothing is reconstructed"
banner — it's true of the build diary and evidence, but the D-cards/Part C/TOUR
*are* retrospective distillations (they say so). If Wren catches the banner and
the 11:08 commit and you defend the banner as covering *everything*, you lose;
if you scope it to the build ("the diary and evidence are live; these three
deliverables are honestly-dated drafts on top"), you win cleanly. The evidence is
on your side — just don't oversell the slogan.

---

## §D — The pushback rule, argued from the other side (D10 / rule 10)

SHIPLOG §3 argues: keep optimism for cheap edits, move consequential writes to
await-before-paint. Here's Wren taking the **opposite** side hard.

**Q (Wren):** I think your pushback is backwards and slightly self-serving. Rule
10 says optimistic *instead of refetching* — it never said "paint success and
walk away." Optimistic UI has always meant optimistic-with-rollback: you show the
change, you keep the promise in flight, and you **revert visibly on error**.
That's not in tension with rule 3 — it's how rule 3 gets *satisfied* without
jank. Your own card 007 required a tested revert-on-error path. So the tension
you're "pushing back on" is one you invented by conflating "optimistic" with
"fire-and-forget." Worse: your fix, await-before-paint on "consequential" writes,
reintroduces exactly the latency and dead-button feel rule 10 exists to kill —
and "consequential" is a slippery line you get to redraw whenever convenient. Why
should I let you weaken a good rule to paper over one un-awaited `upsert` you
could just fix?

**A (best defensible):** Fair hit, and I'll concede the strongest part: the
un-awaited rating (card 012, feedback `upsert` on `(briefing_id,user_id)`) is a
*bug against the spirit of rule 10*, not evidence the rule is wrong. Optimism
done right is optimism-with-rollback, and card 007's list ops do exactly that —
rename→SAVED, delete→gone, revert-on-error required and E2E-tested. So on the
list ops, Wren is right and rule 10 stands as written. Where I'd hold my ground
is narrower than SHIPLOG §3 states it: for a write whose *optimistic paint is a
truth-claim to a third party* — "this briefing is done," "this was rated" — a
rollback that flashes 300ms later is still a window where the UI asserted a
falsehood, and for an accountability surface (the audit trail, feedback others
act on) I'd rather confirm-then-paint. That's not weakening rule 10 for the list;
it's scoping the *un-awaited* variant away from consequential writes. And the
concrete failure is real: the rating showed "YOU RATED THIS USEFUL" before the
write landed (§3, ASSUMED "OPTIMISTIC RATING is not awaited").

**GRADE — PARTIAL FUMBLE.** Wren's framing is genuinely stronger than SHIPLOG §3
as written, and the honest answer has to *give ground*: the real defect is one
un-awaited upsert, and "optimistic instead of refetching" ≠ "fire-and-forget."
SHIPLOG §3 slightly overclaims a "real tension" between rules 10 and 3 that mostly
dissolves once you say optimistic-with-rollback. The defensible core survives
(confirm-before-paint for third-party truth-claims), but **the current write
invites the "you invented the tension / you're moving the line" attack.**
**Rehearse:** lead with the concession (rollback is the right pattern; the rating
is just a bug), then make the *narrow* claim (un-awaited optimism is wrong for
accountability writes), and drop the broad "rule 10 vs rule 3 is a deep tension"
framing — it's the weakest sentence in §3.

---

## §E — The Part B gap: honest boundary, or dodge?

**Q (Wren):** Part B is a *ranked code review of the campaigns PR* — a core
deliverable — and you've shipped a template with three "(pending PR)" bullets and
zero findings. You even name the bug the brief tells you to expect (service-role
key) and then decline to say where it is. Convince me this is principled and not
"I ran out of time and dressed it up as integrity."

**A (best defensible):** The campaigns PR is not in this workspace — I can't
`ls` it, I never received the diff. The constitution's first operating rule is
"never claim a result you did not observe; 'it should work' is an automatic
reject." Writing findings against a diff I've never read would be the *exact*
fabrication this whole system exists to prevent — I'd be inventing line numbers
and failure stories for code I can't see. So Part B ships as the ready-to-run
method + template, and I demonstrate the method works by pointing at the same bug
*class* being a merge-blocking gate in THIS repo: `scripts/constitution.sh` KEY
block fails the build on any `SERVICE_ROLE` in client-reachable code, hardcoded
`sk-ant-`, or a key behind `NEXT_PUBLIC_`. Point that check at the campaigns PR
and the planted key surfaces as a FAIL with file:line. The findings fill in the
moment the PR lands.

**GRADE — MOSTLY STRONG, with one exposed flank.** "I didn't fabricate a review
of code I don't have" is a *genuinely* strong answer — it's the single most
on-brand move in the submission and it's consistent with rule 1. **But it is
only strong if the PR was truly unavailable.** If Wren's response is "the PR was
in the brief / here's the link — you could have pulled it," the principled stand
instantly reframes as a dodge, and there's no recovery because the findings don't
exist. So the answer's strength is **contingent on a fact not in this repo's
control.** Second smaller flank: naming the expected bug class but not producing
*even one* worked example against a realistic snippet leaves it more skeletal
than it needs to be — the method could have been demonstrated harder.
**Rehearse:** (1) be ready to state *precisely why* the PR was unavailable (never
received / not in workspace / access), because that single fact is what makes it
integrity vs. dodge; (2) consider running the KEY check against a *pasted
representative snippet* live in the hour so the method isn't purely hypothetical.
Verdict: **strong answer, fragile premise.**

---

## §F — The single biggest CREDIBILITY RISK in the whole submission

**Not** the Part B gap (that's disclosed and defensible). The biggest risk is a
**broken evidence pointer on the flagship story.**

**The find:** Catch #4 — "we almost migrated onto another product's live
production DB" — is the most-told narrative in the submission: it anchors Part C
§3, it's Catch 1 in SHIPLOG §2, and it's the whole of D02. Two documents cite a
specific proof file by name:

- `docs/catch-log.md` L51 → `evidence/r4-wrong-project-migrations.txt`
- `docs/decisions/D02` L30 → `` `shiplog/evidence/r4-wrong-project-migrations.txt` ``

**That file does not exist.** (`test -f` → MISSING.) The file that *does* exist
is `r4-wrong-project-tables-20260901.txt` (79 KB, the raw schema dump). And the
headline number — "~300 applied migrations for another product" — was **never
saved to a file at all**; it lives only in prose in `r4-blank-project-proof-
20260901.txt` and the catch log. So the one artifact that would *directly* show
the 300 foreign migrations (the migration list) is the one that's named-but-
missing, while the committed artifact proves the foreign *tables* (incl. its
`organizations` table), not the migration count.

**Why it's the top risk:** Wren's signature move is "show me the file." On the
build's proudest catch, `cat shiplog/evidence/r4-wrong-project-migrations.txt`
returns *No such file or directory* — in front of the interviewer, on the story
you lead with. Even though the underlying event is real and *other* evidence
(the tables dump, the blank-project proof, zero writes) corroborates it, a dead
evidence pointer on the flagship claim does disproportionate damage: it makes a
reviewer wonder what *else* is cited-but-absent. It also quietly co-occurs with a
smaller sibling: **SHIPLOG §1 leaves R2 and R3 as unchecked `[ ]` boxes** with
placeholder filenames (`evidence/r2-selects.txt`, `evidence/r3-*.png`) that also
don't exist — in the very section titled "What I verified, and how (per rule),"
even though R2/R3 *are* mechanically enforced in `constitution.sh` L33-47. So the
per-rule proof table has two blank rows and one dead link, on a submission whose
entire thesis is "every claim links to evidence."

**Fix before the real walkthrough (cheap, high-leverage):**
1. Either create `r4-wrong-project-migrations.txt` (paste the actual foreign
   migration list, redacted as needed) **or** repoint both citations (catch-log
   L51, D02 L30) to `r4-wrong-project-tables-20260901.txt`, and reword D02/catch
   #4 so the "~300 migrations" number is tied to an artifact that actually shows
   it (or explicitly say the count is from the session log, not a saved file).
2. Fill SHIPLOG §1 R2 and R3: check the boxes, cite the real `constitution.sh`
   PASS lines (R2 L34, R3 L37, R3c L42-47) and a forced-failure screenshot, or
   delete the placeholder filenames so there are no dangling pointers.
3. Do a 5-minute `grep`-every-cited-filename-and-`test -f`-it sweep across
   SHIPLOG, all D-cards, catch-log, Part C, TOUR — any other dead pointer found
   privately now is one Wren can't find live.

---

## §G — SCORECARD

### Strongest answer
**§C — "written after the fact?"** The git `--diff-filter=A` timestamps
(02:54:03 FAIL file, 02:56:45 PASS file) independently corroborate the SHIPLOG,
the content matches Part C's quotes exactly, and the 03:35 mtime is cleanly
explained by the P1→main merge. Reaching for *commit time* rather than mtime is
the airtight move — you cannot backdate that without a rewrite the reviewer can
detect. (Runner-up: §B, client-disconnect — a textbook "here's what I proved,
here's the named gap, here's the §4 fix.")

### The 3 biggest fumbles (with the exact question that exposed each)

1. **Dead evidence pointer on the flagship catch (§F).**
   *Exposing question:* "Show me `shiplog/evidence/r4-wrong-project-migrations.txt`."
   → `No such file or directory`. The 300-migrations number has no saved
   artifact; the committed file proves foreign *tables*, not the count. Cited in
   catch-log L51 **and** D02 L30.

2. **R5b oversells a WARN as a mechanical guarantee (§A1 / D05).**
   *Exposing question:* "R5b is a WARN that says 'auditor must confirm' — so your
   fix for a grep missing prompts is a bigger grep that doesn't block the merge?"
   → true; D05's "caught by the machine, not just by eye" overstates L76.

3. **D10 invents a rule-10-vs-rule-3 tension that mostly dissolves (§D).**
   *Exposing question:* "Optimistic always meant optimistic-*with-rollback* —
   you conflated it with fire-and-forget to justify weakening a good rule; the
   real defect is one un-awaited upsert."
   → the honest answer has to concede this; SHIPLOG §3's "real tension" framing
   is its weakest sentence.

*(Honorable mention: §E Part B — strong stand, but its strength is contingent on
the PR genuinely being unavailable; be ready to state exactly why.)*

### What to fix or rehearse before the real walkthrough

**FIX (do these — they're cheap and they close real holes):**
- [ ] Repoint or create `r4-wrong-project-migrations.txt`; tie the "~300
      migrations" claim to an artifact that shows it. (catch-log L51, D02 L30)
- [ ] Fill SHIPLOG §1 R2 & R3 (check boxes, cite `constitution.sh` L33-47 +
      forced-failure shot) or remove the dead placeholder filenames.
- [ ] `test -f` every cited evidence filename across all deliverables; kill any
      other dangling pointer privately.

**REHEARSE (the wording that turns a fumble into a clean concession):**
- [ ] **D05:** lead with "R5b is a WARN that widens what the auditor sees, not a
      merge-blocker; the real guarantee is the line-by-line read." Don't let Wren
      discover L76.
- [ ] **D06:** say the disclosure *first* — "only sonnet-5 ran live; opus/haiku
      are validated but unexercised, fix is §4 item 4." Never blur "allowlist
      works" into "the models work."
- [ ] **D10:** concede rollback is the right pattern and the rating is just a
      bug; make only the narrow claim (confirm-before-paint for third-party
      truth-claims); drop the broad rules-10-vs-3 framing.
- [ ] **§C banner:** scope "nothing is reconstructed" to the build diary +
      evidence; explicitly own that Part C / D-cards / TOUR are honestly-dated
      retrospective drafts (stream says 11:05).
- [ ] **Part B:** have the one-sentence reason the campaigns PR was unavailable
      ready; consider a live KEY-check demo against a pasted snippet so the
      method isn't purely hypothetical.

**Net read:** the build itself is unusually well-evidenced and the honesty
posture (ASSUMED list, disclosed gaps) is the submission's real strength — most
hard questions have a pre-written honest answer to redirect to. The danger isn't
the code; it's **presentation debt**: one dead pointer and two blank rows on the
"everything links to evidence" thesis, plus two D-cards that phrase a WARN and a
scoping-choice as stronger than they are. All fixable in under an hour.
