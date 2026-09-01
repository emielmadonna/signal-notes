## Catch #1 — 2026-09-01 02:09 (dry run, README task)
- CLAIM: Builder's stream line follows the constitution's format.
- VICTIM: Emiel, who reads docs/stream.md live as a running narration; and every
  future builder, who learns from this dry run whether the format is enforced.
- THE CATCH: Auditor re-read the line. Constitution mandates present tense; the
  02:05:09 line reads "Wrote the README..." — past tense. Evidence: the line
  itself in docs/stream.md.
- FIX + SYSTEM CHANGE: Builder rewrites the line in present tense; a tense check
  on new stream lines goes onto the gatecheck backlog.

## Catch #2 — 2026-09-01 02:09 (dry run, README task)
- CLAIM: README contains exactly the three required elements and nothing else.
- VICTIM: Any reader of the repo front page, who takes "verified evidence trail"
  as a status assertion; the constitution's own rule "never claim a result you
  did not observe."
- THE CATCH: Auditor byte-checked README.md: the builder added the word
  "verified" — an unproven claim baked into a permanent file while DB checks are
  still skipped. Evidence: xxd/cat output in the auditor's review.
- FIX + SYSTEM CHANGE: Drop "verified"; AGENT-PROMPTS builder prompt gains a
  line: reproduce spec wording, never embellish with adjectives that assert
  unobserved results.

## Catch #3 — 2026-09-01 02:09 (dispatcher self-catch, flagged by auditor)
- CLAIM: Nothing merges before its Change Card is approved.
- VICTIM: The audit trail itself — if pending builder edits ride along inside
  unrelated commits, "no merge before approval" quietly stops being true.
- THE CATCH: Auditor traced git history: dispatcher commit bb4081d (plan
  amendment) swept up builder-0's uncommitted stream line. Evidence:
  git show bb4081d -- docs/stream.md.
- FIX + SYSTEM CHANGE: Dispatcher commits now use targeted file adds only, and
  never include files carrying unapproved builder work. Logged against myself.

### Addendum to Catch #2 — 2026-09-01 02:11 (dispatcher correction)
The builder flagged on resubmission that the word "verified" was present in the
DISPATCHER'S task spec; the builder reproduced spec wording faithfully. Blame
reassigned: the unobserved claim originated with me (dispatcher). The fix and
system change stand — and the builder-prompt rule now cuts both ways: I write
specs without asserting unobserved results, builders don't add them.

## Catch #4 — 2026-09-01 02:23 (P1, before any database write)
- CLAIM: (implicit) the Supabase connection available to the agents is the
  Signal Notes project, ready for migration 0001.
- VICTIM: A live production database for a different product. Its migration
  history shows ~300 applied migrations (campaigns, contacts, billing, wallets)
  and it ALREADY contains an "organizations" table — applying our migration
  0001 there would have collided with production schema, partially applied,
  and put Signal Notes RLS policies onto another product's tables.
- THE CATCH: Dispatcher ran list_migrations + list_tables read-only checks
  BEFORE any write, per "prove, don't assume". Evidence: the pasted migration
  list (300 foreign versions) and project URL ootyfqiujstibjtspdrp.supabase.co
  in the session log; evidence/r4-wrong-project-migrations.txt.
- FIX + SYSTEM CHANGE: Zero writes were sent to that project. Signal Notes gets
  its own freshly created blank project; the project ref will be pinned in the
  repo (checked by the verifier before any DB operation) so no agent can ever
  aim a migration at the wrong database again.
