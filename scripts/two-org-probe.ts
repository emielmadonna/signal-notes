// scripts/two-org-probe.ts — the constitution R1 proof.
//
// Signs in as BOTH seeded users with the anon (browser-grade) client and
// proves tenant isolation from the outside:
//   (a) each user can read their own organization's documents (> 0 rows),
//   (b) each user selecting the OTHER organization's documents by org_id gets
//       exactly 0 rows and no error,
//   (c) each user's attempt to INSERT a document into the other organization
//       is rejected with an error,
//   (d) each user's attempt to UPDATE another organization's document title
//       affects 0 rows or errors,
//   (e) each user selecting the OTHER organization's briefings by org_id gets
//       exactly 0 rows and no error,
//   (f) each user's attempt to INSERT a briefing into the other organization
//       is rejected with an error,
//   (g) each user's attempt to link a briefing in their OWN org to the OTHER
//       organization's document (a briefing_sources insert) is rejected by the
//       composite foreign key specifically (Postgres error code 23503),
//   (h) each user's attempt to write a generation_events log line against the
//       OTHER organization's briefing id is rejected by the composite foreign
//       key specifically (Postgres error code 23503),
//   (i) each user's attempt to attach a briefing_notes margin note to the
//       OTHER organization's briefing id (with their OWN org_id and user_id)
//       is rejected by the composite foreign key specifically (23503),
//   (j) each user's attempt to write an audit_events row against the OTHER
//       organization's briefing id (with their OWN org_id and their own
//       actor_user_id, so only the composite foreign key can object) is
//       rejected by the composite foreign key specifically (23503),
//   (k) each user selecting the OTHER organization's audit_events by org_id
//       gets exactly 0 rows and no error — after first proving their OWN org
//       holds at least one audit row (writing one through their own session
//       if absent, which also exercises the authenticated insert happy path
//       with actor_user_id = self), so the 0 can never be vacuous,
//   (l) each user selecting the OTHER organization's briefing_notes by org_id
//       gets exactly 0 rows and no error.
//
// Setup for (g)-(k): each user finds or creates one briefing in their own org
// (title 'probe briefing', status 'generating', model 'probe') through their
// own session — reused across runs so repeated probes leave no junk behind.
//
// Prints one plain-English PASS/FAIL line per check and exits non-zero if any
// expectation fails.
//
// Run with:  npx tsx scripts/two-org-probe.ts   (from the repo root, after the
// migration is applied and scripts/seed.ts has run)
//
// Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// SEED_USER_PASSWORD. Each may come from the process environment (CI) or from
// .env.local at the repo root (local runs; optional fallback, read by the tiny
// loader below — no dotenv dependency).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";

// --- tiny .env.local loader (no dotenv dependency) --------------------------
// .env.local is an OPTIONAL fallback: when the file is absent (e.g. a clean CI
// checkout where the variables arrive via the process environment), continue
// silently. Variables already set in the environment are never overridden.

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

// Validate AFTER loading: each variable may come from the process environment
// (CI) or from .env.local (local runs). Fatal only when a variable is missing
// from BOTH sources, naming the variable and both places it could come from.
const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SEED_USER_PASSWORD",
] as const;
const missingVars = REQUIRED_VARS.filter((name) => !process.env[name]);
if (missingVars.length > 0) {
  for (const name of missingVars) {
    console.error(
      `Missing required variable ${name}: set it in the process environment (CI) or in .env.local at the repo root (local runs).`
    );
  }
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const seedPassword = process.env.SEED_USER_PASSWORD;

const USERS = [
  { label: "Ana (Northwind Advisory)", email: "ana@northwind-advisory.test" },
  { label: "Marta (Meridian Group)", email: "marta@meridiangroup.test" },
] as const;

type Session = {
  label: string;
  email: string;
  client: SupabaseClient;
  /** This user's own auth.users id, for the cross-org margin-note attempt. */
  userId: string;
  orgId: string;
  /** One of this user's own document ids, for the cross-org update attempt. */
  ownDocumentId: string | null;
  ownDocumentCount: number;
  /** A briefing this user created in their own org, for checks (g) and (h). */
  probeBriefingId: string | null;
};

let failures = 0;
let checksRun = 0;

function report(pass: boolean, message: string): void {
  checksRun += 1;
  if (pass) {
    console.log(`PASS: ${message}`);
  } else {
    failures += 1;
    console.log(`FAIL: ${message}`);
  }
}

function fatal(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

// --- phase 1: sign both users in and learn what each can see ----------------

async function openSession(label: string, email: string): Promise<Session> {
  const client = createClient(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({
    email,
    password: seedPassword!,
  });
  if (signIn.error) {
    fatal(`could not sign in as ${email}: ${signIn.error.message}`);
  }
  const userId = signIn.data.user?.id;
  if (!userId) {
    fatal(`sign-in for ${email} returned no user id.`);
  }

  const memberships = await client.from("org_members").select("org_id");
  if (memberships.error) {
    fatal(`could not read org membership for ${email}: ${memberships.error.message}`);
  }
  if (!memberships.data || memberships.data.length === 0) {
    fatal(`${email} belongs to no organization — run scripts/seed.ts first.`);
  }
  const orgId = memberships.data[0].org_id;

  const ownDocs = await client
    .from("documents")
    .select("id, org_id, title")
    .eq("org_id", orgId);
  if (ownDocs.error) {
    fatal(`could not read own documents for ${email}: ${ownDocs.error.message}`);
  }
  const rows = ownDocs.data ?? [];

  return {
    label,
    email,
    client,
    userId,
    orgId,
    ownDocumentId: rows.length > 0 ? rows[0].id : null,
    ownDocumentCount: rows.length,
    probeBriefingId: null,
  };
}

/**
 * Setup for checks (g)-(k): each user needs one briefing in their OWN org.
 * Idempotent: the verifier runs this probe before every merge and deploy, so
 * an existing 'probe briefing' is reused instead of piling up junk rows the
 * demo orgs could never delete.
 */
async function createProbeBriefing(session: Session): Promise<void> {
  const existing = await session.client
    .from("briefings")
    .select("id, title")
    .eq("org_id", session.orgId)
    .eq("title", "probe briefing")
    .limit(1);
  if (existing.error) {
    fatal(
      `${session.email} could not look up an existing probe briefing: ${existing.error.message}`
    );
  }
  if (existing.data && existing.data.length > 0) {
    session.probeBriefingId = existing.data[0].id;
    return;
  }
  const inserted = await session.client
    .from("briefings")
    .insert({
      org_id: session.orgId,
      title: "probe briefing",
      status: "generating",
      model: "probe",
    })
    .select("id")
    .single();
  if (inserted.error) {
    fatal(
      `${session.email} could not create a probe briefing in their own org: ${inserted.error.message}`
    );
  }
  session.probeBriefingId = inserted.data.id;
}

// --- phase 2: each user attacks the other organization ----------------------

async function probeUser(me: Session, other: Session): Promise<void> {
  console.log(`\n--- Probing as ${me.label} <${me.email}> against ${other.label}'s data ---`);

  // (a) own-org read: expect > 0 documents.
  report(
    me.ownDocumentCount > 0,
    me.ownDocumentCount > 0
      ? `${me.label} can read their own organization's documents (${me.ownDocumentCount} rows).`
      : `${me.label} sees zero documents in their own organization — expected more than 0 after seeding.`
  );

  // (b) other-org read by org_id: expect exactly 0 rows and no error.
  const crossRead = await me.client
    .from("documents")
    .select("id, org_id, title")
    .eq("org_id", other.orgId);
  const crossReadRows = crossRead.data ? crossRead.data.length : 0;
  report(
    crossRead.error === null && crossReadRows === 0,
    crossRead.error === null
      ? `${me.label} selecting the other organization's documents gets exactly 0 rows (got ${crossReadRows}).`
      : `${me.label} selecting the other organization's documents should return 0 rows without an error, but errored: ${crossRead.error.message}`
  );

  // (c) insert into the other org: expect a rejection error.
  const crossInsert = await me.client.from("documents").insert({
    org_id: other.orgId,
    title: `Probe intrusion attempt by ${me.email}`,
    kind: "other",
    body: "This row must never exist. If you can read this in the database, tenant isolation is broken.",
  });
  report(
    crossInsert.error !== null,
    crossInsert.error !== null
      ? `${me.label} inserting a document into the other organization is rejected (${crossInsert.error.message}).`
      : `${me.label} inserting a document into the other organization SUCCEEDED — tenant isolation is broken.`
  );

  // (d) update another org's document title: expect 0 rows affected or an error.
  if (other.ownDocumentId === null) {
    report(
      false,
      `${me.label} cannot attempt the cross-org document update: the other organization has no seeded document to target. Run scripts/seed.ts first.`
    );
  } else {
    const crossUpdate = await me.client
      .from("documents")
      .update({ title: `Tampered by ${me.email}` })
      .eq("id", other.ownDocumentId)
      .select("id");
    const crossUpdateRows = crossUpdate.data ? crossUpdate.data.length : 0;
    report(
      crossUpdate.error !== null || crossUpdateRows === 0,
      crossUpdate.error !== null
        ? `${me.label} updating the other organization's document errored as expected (${crossUpdate.error.message}).`
        : crossUpdateRows === 0
          ? `${me.label} updating the other organization's document affected 0 rows.`
          : `${me.label} updating the other organization's document CHANGED ${crossUpdateRows} row(s) — tenant isolation is broken.`
    );
  }

  // (e) other-org briefings read by org_id: expect exactly 0 rows and no error.
  const briefingRead = await me.client
    .from("briefings")
    .select("id, org_id, title, status")
    .eq("org_id", other.orgId);
  const briefingReadRows = briefingRead.data ? briefingRead.data.length : 0;
  report(
    briefingRead.error === null && briefingReadRows === 0,
    briefingRead.error === null
      ? `${me.label} selecting the other organization's briefings gets exactly 0 rows (got ${briefingReadRows}).`
      : `${me.label} selecting the other organization's briefings should return 0 rows without an error, but errored: ${briefingRead.error.message}`
  );

  // (f) insert a briefing into the other org: expect a rejection error.
  const briefingInsert = await me.client.from("briefings").insert({
    org_id: other.orgId,
    title: `Probe intrusion briefing by ${me.email}`,
    status: "generating",
    model: "probe",
  });
  report(
    briefingInsert.error !== null,
    briefingInsert.error !== null
      ? `${me.label} inserting a briefing into the other organization is rejected (${briefingInsert.error.message}).`
      : `${me.label} inserting a briefing into the other organization SUCCEEDED — tenant isolation is broken.`
  );

  // (g) link my own briefing to the OTHER org's document: must be rejected by
  // the composite (document_id, org_id) reference even though the row's own
  // org_id is mine.
  if (me.probeBriefingId === null || other.ownDocumentId === null) {
    report(
      false,
      `${me.label} cannot attempt the cross-org grounding link: missing probe briefing or target document. Run scripts/seed.ts first.`
    );
  } else {
    const crossSource = await me.client.from("briefing_sources").insert({
      briefing_id: me.probeBriefingId,
      document_id: other.ownDocumentId,
      org_id: me.orgId,
    });
    // Only a foreign-key violation (Postgres code 23503) proves the composite
    // reference did the blocking; any other rejection is the wrong mechanism.
    report(
      crossSource.error !== null && crossSource.error.code === "23503",
      crossSource.error === null
        ? `${me.label} linking their own briefing to the other organization's document SUCCEEDED — the composite reference is broken.`
        : crossSource.error.code === "23503"
          ? `${me.label} linking their own briefing to the other organization's document is rejected by the composite foreign key (code 23503: ${crossSource.error.message}).`
          : `${me.label} linking their own briefing to the other organization's document was rejected, but NOT by the composite foreign key (code ${crossSource.error.code}: ${crossSource.error.message}).`
    );
  }

  // (h) write a log line against the OTHER org's briefing id: must be rejected
  // by the composite (briefing_id, org_id) reference even though the row's own
  // org_id is mine.
  if (other.probeBriefingId === null) {
    report(
      false,
      `${me.label} cannot attempt the cross-org log write: the other organization has no probe briefing to target.`
    );
  } else {
    const crossEvent = await me.client.from("generation_events").insert({
      briefing_id: other.probeBriefingId,
      org_id: me.orgId,
      kind: "status",
      content: `Probe intrusion log line by ${me.email}. This row must never exist.`,
    });
    // Only a foreign-key violation (Postgres code 23503) proves the composite
    // reference did the blocking; any other rejection is the wrong mechanism.
    report(
      crossEvent.error !== null && crossEvent.error.code === "23503",
      crossEvent.error === null
        ? `${me.label} writing a log line against the other organization's briefing SUCCEEDED — the composite reference is broken.`
        : crossEvent.error.code === "23503"
          ? `${me.label} writing a log line against the other organization's briefing is rejected by the composite foreign key (code 23503: ${crossEvent.error.message}).`
          : `${me.label} writing a log line against the other organization's briefing was rejected, but NOT by the composite foreign key (code ${crossEvent.error.code}: ${crossEvent.error.message}).`
    );
  }

  // (i) attach a margin note to the OTHER org's briefing id: must be rejected
  // by the composite (briefing_id, org_id) reference even though the row's own
  // org_id and user_id are mine.
  if (other.probeBriefingId === null) {
    report(
      false,
      `${me.label} cannot attempt the cross-org margin note: the other organization has no probe briefing to target.`
    );
  } else {
    const crossNote = await me.client.from("briefing_notes").insert({
      briefing_id: other.probeBriefingId,
      org_id: me.orgId,
      user_id: me.userId,
      section_index: 0,
      body: `Probe intrusion margin note by ${me.email}. This row must never exist.`,
    });
    // Only a foreign-key violation (Postgres code 23503) proves the composite
    // reference did the blocking; any other rejection is the wrong mechanism.
    report(
      crossNote.error !== null && crossNote.error.code === "23503",
      crossNote.error === null
        ? `${me.label} attaching a margin note to the other organization's briefing SUCCEEDED — the composite reference is broken.`
        : crossNote.error.code === "23503"
          ? `${me.label} attaching a margin note to the other organization's briefing is rejected by the composite foreign key (code 23503: ${crossNote.error.message}).`
          : `${me.label} attaching a margin note to the other organization's briefing was rejected, but NOT by the composite foreign key (code ${crossNote.error.code}: ${crossNote.error.message}).`
    );
  }

  // (j) write an audit line against the OTHER org's briefing id: must be
  // rejected by the composite (briefing_id, org_id) reference even though the
  // row's own org_id is mine.
  if (other.probeBriefingId === null) {
    report(
      false,
      `${me.label} cannot attempt the cross-org audit write: the other organization has no probe briefing to target.`
    );
  } else {
    // actor_user_id is the prober's own id so the RLS insert policy passes
    // and only the composite foreign key can object.
    const crossAudit = await me.client.from("audit_events").insert({
      org_id: me.orgId,
      briefing_id: other.probeBriefingId,
      event: "NOTE",
      detail: `Probe intrusion audit line by ${me.email}. This row must never exist.`,
      actor: "PROBE",
      actor_user_id: me.userId,
    });
    // Only a foreign-key violation (Postgres code 23503) proves the composite
    // reference did the blocking; any other rejection is the wrong mechanism.
    report(
      crossAudit.error !== null && crossAudit.error.code === "23503",
      crossAudit.error === null
        ? `${me.label} writing an audit line against the other organization's briefing SUCCEEDED — the composite reference is broken.`
        : crossAudit.error.code === "23503"
          ? `${me.label} writing an audit line against the other organization's briefing is rejected by the composite foreign key (code 23503: ${crossAudit.error.message}).`
          : `${me.label} writing an audit line against the other organization's briefing was rejected, but NOT by the composite foreign key (code ${crossAudit.error.code}: ${crossAudit.error.message}).`
    );
  }

  // (k) other-org audit_events read by org_id: expect exactly 0 rows and no
  // error. To keep the 0 from being vacuous, first prove MY OWN org holds at
  // least one audit row — writing one through this session if absent, which
  // also exercises the authenticated insert happy path (actor_user_id = self).
  const ownAudit = await me.client
    .from("audit_events")
    .select("id, org_id, event")
    .eq("org_id", me.orgId)
    .limit(1);
  if (ownAudit.error) {
    fatal(
      `${me.email} could not read their own organization's audit trail: ${ownAudit.error.message}`
    );
  }
  if (!ownAudit.data || ownAudit.data.length === 0) {
    const selfAudit = await me.client.from("audit_events").insert({
      org_id: me.orgId,
      briefing_id: me.probeBriefingId,
      event: "VIEWED",
      detail: `Probe self-check line by ${me.email}, written so the cross-org 0-rows check cannot pass vacuously.`,
      actor: "PROBE",
      actor_user_id: me.userId,
    });
    if (selfAudit.error) {
      fatal(
        `${me.email} could not write an audit line in their OWN org — the authenticated insert happy path is broken: ${selfAudit.error.message}`
      );
    }
  }
  const auditRead = await me.client
    .from("audit_events")
    .select("id, org_id, event")
    .eq("org_id", other.orgId);
  const auditReadRows = auditRead.data ? auditRead.data.length : 0;
  report(
    auditRead.error === null && auditReadRows === 0,
    auditRead.error === null
      ? `${me.label} selecting the other organization's audit trail gets exactly 0 rows (got ${auditReadRows}; own org verified non-empty first).`
      : `${me.label} selecting the other organization's audit trail should return 0 rows without an error, but errored: ${auditRead.error.message}`
  );

  // (l) other-org briefing_notes read by org_id: expect exactly 0 rows and no
  // error.
  const notesRead = await me.client
    .from("briefing_notes")
    .select("id, org_id, section_index")
    .eq("org_id", other.orgId);
  const notesReadRows = notesRead.data ? notesRead.data.length : 0;
  report(
    notesRead.error === null && notesReadRows === 0,
    notesRead.error === null
      ? `${me.label} selecting the other organization's margin notes gets exactly 0 rows (got ${notesReadRows}).`
      : `${me.label} selecting the other organization's margin notes should return 0 rows without an error, but errored: ${notesRead.error.message}`
  );
}

// --- main --------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Two-org probe: proving tenant isolation from the outside (constitution R1).");

  const ana = await openSession(USERS[0].label, USERS[0].email);
  const marta = await openSession(USERS[1].label, USERS[1].email);

  if (ana.orgId === marta.orgId) {
    fatal("both users report the same organization — the seed is wrong, the probe cannot prove isolation.");
  }

  await createProbeBriefing(ana);
  await createProbeBriefing(marta);

  await probeUser(ana, marta);
  await probeUser(marta, ana);

  console.log("");
  if (failures > 0) {
    console.log(`RESULT: FAIL — ${failures} of ${checksRun} check(s) failed. Tenant isolation is NOT proven.`);
    process.exit(1);
  }
  console.log(
    `RESULT: PASS — all ${checksRun} checks passed (12 per user, run as both users). ` +
      "Proven: documents (cross-org select returns 0 rows; cross-org insert rejected; cross-org update touches 0 rows), " +
      "briefings (cross-org select returns 0 rows; cross-org insert rejected), " +
      "briefing_sources (insert linking an own-org briefing to the other org's document rejected by the composite FK), " +
      "generation_events (insert against the other org's briefing id rejected by the composite FK), " +
      "briefing_notes (margin note against the other org's briefing id rejected by the composite FK; cross-org select returns 0 rows), " +
      "audit_events (insert against the other org's briefing id rejected by the composite FK; cross-org select returns 0 rows " +
      "with the reader's own org first proven non-empty, and the own-org insert happy path with actor_user_id = self exercised as that setup). " +
      "Not exercised by this probe: organizations, org_members, briefing_feedback, " +
      "audit_events' document-side composite reference (its briefing-side twin is), " +
      "and the actor_user_id forgery rejection (the policy requires actor_user_id = the signed-in user, but no check attempts another value)."
  );
}

main().catch((err) => {
  console.error("FATAL: unexpected error during probe:", err);
  process.exit(1);
});
