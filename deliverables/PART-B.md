# PART B — Ranked findings review (the campaigns PR)

> STATUS: **BLOCKED ON SOURCE MATERIAL — not yet executable, and deliberately
> not fabricated.** Part B is a code review of the *campaigns PR* provided by
> the T2D3 Milestone 0 brief. That PR is not in this workspace, and the
> constitution's rule is absolute: *never claim a result you did not observe.*
> Reviewing a diff I have never seen would be exactly the "it should work"
> fabrication the whole system exists to prevent. So this file is the ready-to-
> run method and template; the findings get filled in the moment the PR lands.
>
> TO COMPLETE: drop the campaigns PR (diff or repo) into the workspace and the
> Analyst fills every SHOW-ME block below against the real lines.

## The method (how Part B gets produced, and why it's trustworthy)

Each finding is ranked by severity and carries a SHOW-ME block so a non-coder
can retell the failure from memory:

- **S0 — blocks merge**: a leak, a data-loss path, a security hole.
- **S1 — fix this week**: a real bug with a workaround or a narrow blast radius.
- **S2 — cleanup**: correctness-neutral quality/consistency.

Template per finding:

```
### [S0|S1|S2] <one-sentence name of the concrete failure>
FIX (one line): <the change that closes it>
SHOW ME:
  - QUOTE: <the exact line(s) from the PR, verbatim>
  - WALKTHROUGH: <plain-English, step by step, how the failure plays out in
    production — no jargon, retellable from memory>
  - HOW YOU'D VERIFY: <the query/command/screenshot that proves it real>
```

Then: **propose the top 3** and argue why each earns its rank. Expect Emiel to
challenge every finding — the only valid answer is the quoted code plus the
failure story, never reassurance.

## The one finding the brief tells us to expect (method demonstrated)

The homework states a **service-role-key exposure** bug is planted in the
campaigns PR. Without the PR I will not assert where it is — but this build
already proves the review would catch it, because the same class is a
merge-blocking gate here:

- Our verifier (`scripts/constitution.sh`, the KEY block) fails the build on
  any `SERVICE_ROLE` reference in client-reachable code, any hardcoded
  `sk-ant-` key, any `ANTHROPIC_API_KEY` read outside server code, and any
  service/AI key exposed via a `NEXT_PUBLIC_` env var.
- HOW YOU'D VERIFY (on our repo, today): `npm run constitution` → the four
  `KEY …` PASS lines. Point the same check at the campaigns PR and a planted
  service-role key surfaces as a FAIL with `file:line`.

That is the shape every Part-B finding will take: a rule, the exact line, the
failure story, and the command that proves it — the campaigns PR just supplies
the real lines.

## Top 3 (to be filled from the real PR)

1. _(pending PR — expected: the S0 service-role-key exposure)_
2. _(pending PR)_
3. _(pending PR)_
