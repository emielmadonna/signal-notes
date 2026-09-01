# Part C — Incident write-up: the migration that looked done but never ran

*Written to be read aloud and defended. Every claim carries a plain-English "how you'd verify this" line. The structural fix is not a proposal — it is a check already running in this repo's CI, and I name the file and the run.*

---

## 1. What happened

A database migration was merged to main and marked done: the SQL file was in
git, the pull request was green, the ticket was closed. But the migration never
actually ran against the production database. It was "done" in the code and
absent in the live system.

Concretely: the migration added a column the application code depends on. In
git the column exists, so the code that reads and writes it looks correct,
type-checks, and passes review. In production the column was never created,
because the migration's *tracking row* — the record the migration tool writes to
say "I applied this file to this database" — never landed. The gap between "the
file is committed" and "the database was actually changed" is exactly where this
failure lives.

That gap shows up in one of two shapes, often both:

- **Loud failure:** requests that touch the missing column throw at runtime.
  Users hit errors on a feature that "shipped" and passed review.
- **Silent wrong behavior:** worse, code that expects the column reads or writes
  around its absence — defaults, nulls, skipped logic — so nothing crashes but
  the data is quietly wrong. This one can run for days before anyone notices.

**How you'd verify this happened:** compare two lists side by side. The migration
files committed to the repo (`ls supabase/migrations/`) versus the migrations
the live database records as applied
(`select version from supabase_migrations.schema_migrations`). A file in the
first list with no matching row in the second *is* the ghost migration — the
proof, not a guess. Confirm the specific damage by asking the live schema whether
the expected column exists (`information_schema.columns`).

---

## 2. The first three Monday actions, in order

The order is the argument: stabilize before you diagnose, diagnose before you
change anything permanent. Out of order, you either prolong the outage or "fix"
the wrong thing.

**First — stop the bleeding.** Establish whether this is loud (throwing) or
silent (wrong data), and cap the damage. If it is silent and writing bad data,
close the affected write path or flag it off — every minute of silent corruption
makes the cleanup larger. If it is loud, pick fast between the two safe moves:
roll the code back to the version that didn't need the column, or apply the
missing migration forward. *Verify:* the error rate on the affected route
returns to baseline, or the bad-write path is confirmed closed (no new
wrong-shaped rows after time T). You watch the number; you don't assume it.

**Second — establish ground truth.** With damage capped, answer the real
question: which migrations are committed but not applied, on *this* database,
right now? Run the two-list comparison from section 1. This is second, not
first, because you can only fix what you can *see*, and you cannot trust the git
state or the ticket — only the live database's own record of what it applied.
*Verify:* you can point at the exact file(s) with no tracking row and the exact
column(s) missing from `information_schema`. The diagnosis is a printed list,
not a theory.

**Third — prevent recurrence, then remediate data.** Only now the lasting
change: a gate that fails the build whenever a committed migration has no
tracking row in the target database, so "done in git" can never again mean
"absent in production." Then, with the schema correct and the gate in place,
repair any data the silent window corrupted. Recurrence-prevention comes before
cleanup because cleaning data while the same hole is open invites doing it twice.
*Verify:* the gate, run against a database deliberately missing a migration,
FAILS; run against the corrected database, it PASSES — both directions observed
(see section 3).

---

## 3. The structural change

**This isn't a proposal. It's running in our CI right now. Here's the file, and
here's the run.**

The fix is a ghost-migration gate, and it already exists as the **R4 block of
`scripts/constitution.sh`** (the verifier that gates every merge and every
deploy). What it does, plainly:

1. It loops over every `.sql` file in `supabase/migrations/`.
2. For each, it asks the live database: *does
   `supabase_migrations.schema_migrations` contain a tracking row for this
   version?*
3. If any committed migration has **no** tracking row, it prints
   `R4 GHOST MIGRATION: <file> is committed but has no tracking row in the live
   DB` and **fails the build** — merge and deploy are blocked.

The same verifier also reads `information_schema.columns` from the live database
(saved as R4 evidence), so "the file ran" is backed by "the columns the code
expects actually exist," not just that a row was stamped. The exact lines in
`scripts/constitution.sh`: L158 (the detector's comment), L163 (the
`count(*) ... where version=` query), L165 (the PASS line), L167 (the FAIL
line).

**Evidence it works in both directions** — the strongest thing I can say about a
gate is that I've watched it both catch and clear:

- It **caught** the ghost before our first migration was applied:
  `shiplog/evidence/constitution-20260901-023502.txt` —
  `FAIL R4 GHOST MIGRATION: supabase/migrations/20260901000001_foundation.sql is
  committed but has no tracking row in the live DB`.
- It **cleared** once the migration truly ran:
  `shiplog/evidence/constitution-20260901-025459.txt` —
  `PASS R4 migration 20260901000001 applied (tracking row present)`; the latest
  run (`constitution-20260901-042448.txt`) shows PASS for both migrations 0001
  and 0002.

This class was exercised for real beyond that one run. **Catch #4** is the same
failure's more dangerous cousin: the tooling was one command from applying our
migration to a *different product's* live database (~300 foreign migrations, its
own `organizations` table). We caught it by reading the live migration list
before any write — the same "trust the database's record, not the assumption"
move — and pinned the project ref so no agent can aim a migration at the wrong
database again. **Catch #11** is where this gate had to survive CI itself: it ran
on GitHub, failed opaquely, and we made it emit readable evidence so the gate can
never fail unreadably again.

**How you'd verify the structural claim yourself:** read the R4 block of
`scripts/constitution.sh` (lines 158-170), then read the FAIL line and PASS line
in the two evidence files named above. To prove it still bites, delete a tracking
row on a scratch database and run `npm run constitution` — it fails on exactly
that file. The gate, the file, and the run are all in the repo.

*One honest boundary: this gate proves a committed migration was applied and that
the expected columns exist. It does not prove the migration's contents are
correct — that is what the two-org probe and the adversarial audit cover. R4
closes precisely the "done in git, absent in production" gap, which is the gap
this incident is about.*
