// scripts/seed.ts — idempotent seed for Signal Notes.
//
// Creates two organizations ("Northwind Advisory", "Meridian Group"), one user
// each, membership rows, and six realistic documents per organization. Safe to
// run twice: everything is looked up before it is created.
//
// Run with:  npx tsx scripts/seed.ts   (from the repo root)
//
// Env — each variable may come from the process environment (CI) or from
// .env.local at the repo root (local runs; optional fallback, read by the tiny
// loader below — no dotenv dependency):
//   NEXT_PUBLIC_SUPABASE_URL       required
//   SUPABASE_SERVICE_ROLE_KEY      required (server-side only; never NEXT_PUBLIC_)
//   SEED_USER_PASSWORD             optional; generated if absent (never printed)
//
// Constitution: R2 (named columns on every select/insert), R3 (every write's
// { error } checked; on error we print it and exit 1).

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
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
  "SUPABASE_SERVICE_ROLE_KEY",
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const passwordFromEnv = process.env.SEED_USER_PASSWORD;
const seedPassword =
  passwordFromEnv ?? randomBytes(18).toString("base64url");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// R3 helper: every write's { error } goes through here.
function failIf(error: { message: string } | null, context: string): void {
  if (error) {
    console.error(`FAILED: ${context}: ${error.message}`);
    process.exit(1);
  }
}

// --- seed data ---------------------------------------------------------------

type SeedDocument = {
  title: string;
  kind: "interview_notes" | "call_transcript" | "web_copy" | "other";
  body: string;
};

const northwindDocuments: SeedDocument[] = [
  {
    title: "Interview notes — Priya Raghavan, VP Sales at Callisto Metrics (Aug 27, 2026)",
    kind: "interview_notes",
    body: `Spoke with Priya Raghavan for 45 minutes on August 27, 2026 about how Callisto Metrics buys advisory work. Key points. Their sales team grew from 12 to 31 reps in fourteen months and the playbook did not keep up; reps improvise discovery and pricing conversations. Priya said the phrase that stuck with me: "We hired athletes and gave them no plays." Budget authority for enablement sits with her, not with RevOps, which contradicts what we assumed in the proposal draft. She has roughly $180k of unspent enablement budget that expires at fiscal year end in January 2027, so a Q4 2026 start matters to her. Objections she raised: previous consultants delivered a deck and disappeared; she wants working sessions with her front-line managers, not documents. She asked twice whether we had operators, not just analysts, on the team. Competitive angle: they are also talking to a solo ex-CRO consultant who is cheaper but cannot cover six markets. Next step agreed: we send a two-page working-session outline by September 4 and she books a follow-up with her CFO the week after.`,
  },
  {
    title: "Interview notes — churned client debrief, Harbor & Lane (Aug 20, 2026)",
    kind: "interview_notes",
    body: `Debrief interview with Tom Okafor, COO of Harbor & Lane, who ended our retainer in July. Held August 20, 2026; he was generous with 40 minutes. Why they left, in his words: the monthly readouts felt like status theater, and the recommendations stopped landing on anything his team could execute in a two-week window. He was clear that the first six months were valuable — the ICP redefinition and the territory redesign both stuck and are still in use. The falloff began when our engagement lead changed in March and the new lead spent two sessions relearning context. Lesson for us: continuity is part of the product; a handover doc is not a handover. He would consider project-based work again but never another open-ended retainer. Pricing was not the issue; he said the retainer was "cheap enough to ignore," which is its own warning. He agreed to be a reference for the first-six-months work if we ask specifically about the territory redesign. Action items: write a continuity clause into new retainer agreements, and build a two-week-executable format for recommendations.`,
  },
  {
    title: "Call transcript — discovery call with Delacroix Logistics (Aug 31, 2026)",
    kind: "call_transcript",
    body: `Transcript excerpt, discovery call, August 31, 2026. Attendees: Marie Delacroix (CEO), Sam Whitfield (Head of Growth), Ana Ferreira (Northwind).\n\nAna: Walk me through what changed that made you reach out now.\nMarie: We closed the Ostrander contract in June, which doubled our warehouse volume commitments, and our pipeline for the next two quarters does not support the capacity we just bought. We have a sales problem dressed up as a capacity win.\nSam: Concretely, we need forty new mid-market logos in twelve months and our current motion produced eleven last year.\nAna: What have you already tried?\nSam: We hired two outbound reps in April. They are generating meetings but the meetings do not convert; our close rate from first meeting is under eight percent.\nMarie: I think the problem is who we are selling to, not how many calls we make.\nAna: That matches a pattern we see. Before I propose anything, I would want two weeks of pipeline archaeology — every lost deal from the last year, coded for reason.\nMarie: If two weeks of that tells us where the eight percent comes from, that is money well spent. Send us the scope by Friday, September 4.`,
  },
  {
    title: "Call transcript — pricing workshop with Callisto Metrics (Sep 1, 2026)",
    kind: "call_transcript",
    body: `Transcript excerpt, pricing working session, September 1, 2026. Attendees: Priya Raghavan (VP Sales, Callisto), Deepak Mehta (CFO, Callisto), Ana Ferreira (Northwind).\n\nDeepak: Before we talk about your fees, convince me this is not a deck-delivery engagement.\nAna: Fair. The deliverable is your managers running the new plays in live deals by week six, with us in the room. The paper is a byproduct.\nPriya: I told Deepak about the working-session format. My concern is calendar cost. Six managers, weekly sessions — what am I actually committing?\nAna: Ninety minutes weekly per manager for eight weeks, plus one deal review. If a manager misses two sessions, we pause and tell you rather than bill through it.\nDeepak: I appreciate that you said that unprompted. On structure: I will not sign an open-ended retainer. Fixed scope, fixed fee, an option to extend.\nAna: That is how we would rather work too. Fixed eight-week program, priced at the number I sent Priya, extension priced separately and only if the win-rate movement justifies it.\nDeepak: Send the option-to-extend language and the win-rate baseline method. If both hold up, we can start mid-September.`,
  },
  {
    title: "Homepage copy draft v3 — Northwind Advisory",
    kind: "web_copy",
    body: `Headline: Revenue advice that survives contact with Monday morning.\n\nSubhead: Northwind Advisory works with B2B leadership teams whose go-to-market has outgrown its playbook. We do not leave decks. We leave working habits.\n\nSection — What we do: We diagnose why pipeline is not converting, redesign the motion around the customers who actually buy, and then coach your front-line managers until the new plays run without us. Typical engagements run eight to twelve weeks, fixed scope, fixed fee.\n\nSection — How we are different: Every Northwind engagement is led by someone who has carried a number. We cap our client roster at eight so senior people do the work that senior people sold. Our recommendations come formatted for two-week execution windows, because advice that cannot be scheduled is not advice.\n\nSection — Proof: Clients this year cut average sales cycle length by a third, and one doubled first-meeting close rates in a quarter. Ask us about the territory redesign work; our references will take the call.\n\nCall to action: Book a 30-minute diagnostic conversation. If we cannot name your likely bottleneck by the end of it, we will say so and waive the follow-up.`,
  },
  {
    title: "Q3 pipeline review memo (Aug 29, 2026)",
    kind: "other",
    body: `Internal memo, August 29, 2026, author: Ana Ferreira. Subject: Q3 pipeline position going into September.\n\nWhere we stand: eleven qualified opportunities, weighted value roughly $640k against a Q4 booking target of $450k. Coverage looks healthy at 1.4x but is concentrated: Callisto Metrics and Delacroix Logistics together are 55 percent of weighted value. If either slips past October, we miss.\n\nCallisto: strongest position. CFO engaged as of September 1 workshop; the ask is fixed-scope language and a win-rate baseline method. Risk is calendar, not intent. Owner: Ana, due September 4.\n\nDelacroix: discovery went well; they asked for a pipeline-archaeology scope by September 4. Small initial engagement but a land-and-expand shape. Owner: Ana.\n\nStalled: Ravensworth Media has gone quiet since August 8. One more touch, then move to nurture.\n\nProcess note: we are still writing proposals from scratch each time. Two hours per proposal times nine proposals this quarter is a full working week. Decision needed at Monday partner meeting: adopt the modular proposal library Jonas drafted, or consciously accept the cost.`,
  },
];

const meridianDocuments: SeedDocument[] = [
  {
    title: "Interview notes — CFO panel at MidMarket Finance Summit (Aug 21, 2026)",
    kind: "interview_notes",
    body: `Notes from the CFO panel at the MidMarket Finance Summit, Chicago, August 21, 2026. Panelists: three CFOs from $50-200M revenue companies; I captured what matters for the Meridian Benchmarking launch. Recurring theme: every CFO said they distrust benchmark data whose sample they cannot inspect. One said, "If I cannot see who is in the denominator, the number is a rumor." That is a direct argument for our transparent-cohort feature and should lead the landing page. Second theme: procurement timing. Two of three CFOs lock advisory budgets in October for the following calendar year, which means our launch window for annual deals is now through mid-October 2026; after that we are selling into next year. Third: nobody on the panel wanted another dashboard. They want a quarterly conversation where someone tells them which two numbers deserve attention and what peers did about it. Packaging implication: sell the review meeting, include the dashboard, not the reverse. Skepticism to prepare for: one panelist got burned by a benchmarking vendor recycling stale 2023 data. We should state our data refresh cadence in the first sales conversation, unprompted.`,
  },
  {
    title: "Call transcript — renewal call, Vantage Credit Union (Aug 26, 2026)",
    kind: "call_transcript",
    body: `Transcript excerpt, renewal discussion, August 26, 2026. Attendees: Dana Kowalski (SVP Operations, Vantage Credit Union), Marta Silva (Meridian Group).\n\nMarta: You have been a client for two years. Before we talk renewal, what would make you not renew?\nDana: Honestly? The first year changed how we run our branch network. The second year felt like maintenance. If year three is more maintenance, I can do maintenance with my own team.\nMarta: That is fair and I would rather hear it now. What is the problem you are staring at for 2027?\nDana: Deposit growth. Our members are aging and our digital onboarding loses half of applicants before funding. Nobody on my team has run a funnel-fix like that.\nMarta: Then the renewal conversation should be about that, not about continuing the branch work. Suppose we scoped year three entirely around onboarding conversion, with the branch benchmarks moving to a self-serve quarterly report?\nDana: If the price reflects that shift, that interests me. I need a proposal before our board packet closes on September 12.\nMarta: You will have it by September 8, with a conversion baseline drawn from your own funnel data, not industry averages.`,
  },
  {
    title: "Call transcript — partner introduction, Bluepeak Systems (Sep 1, 2026)",
    kind: "call_transcript",
    body: `Transcript excerpt, partner introduction call, September 1, 2026. Attendees: Reuben Marsh (VP Alliances, Bluepeak Systems), Marta Silva and Kofi Mensah (Meridian Group).\n\nReuben: Our implementation teams keep getting asked strategy questions mid-deployment. We are systems people; we do not want to answer them badly, and we do not want to build a consulting arm.\nKofi: How often does that happen, concretely?\nReuben: Of the forty ERP deployments we will do this year, I would say fifteen stall for reasons that are organizational, not technical. Ownership fights, process debates, nobody deciding.\nMarta: Those stalls are exactly the shape of work we do. What would a referral motion look like from your side?\nReuben: Simple to start. When a project manager flags an organizational stall, they hand the client a one-pager about you and make an email introduction. We want no referral fee in year one; we want deployments to stop stalling.\nMarta: We can draft that one-pager and a joint escalation checklist by September 15. One ask: a monthly thirty-minute review of stalled projects so we learn the patterns.\nReuben: Agreed. Send a summary of this and I will loop in our delivery director.`,
  },
  {
    title: "Landing page copy — Meridian Benchmarking service",
    kind: "web_copy",
    body: `Headline: Know exactly where you stand. See exactly who you are standing next to.\n\nSubhead: Meridian Benchmarking gives mid-market finance and operations leaders peer comparisons with a transparent cohort — you see the profile of every company in your comparison set, so the number means something.\n\nSection — The quarterly review: Every quarter, a Meridian director walks your leadership team through the two metrics that moved, why they likely moved, and what peer companies did in the same position. The dashboard is included. The conversation is the product.\n\nSection — Transparent cohorts: No black-box averages. Your comparison set is built with you at onboarding: industry, revenue band, operating model. You can inspect it, challenge it, and change it once a year.\n\nSection — Fresh data, stated plainly: Cohort data refreshes quarterly. The refresh date is printed on every page of every report. If a number is stale, it says so.\n\nSection — Built for budget season: Most clients start in Q4 to arm their annual planning. Onboarding takes three weeks from signed order to first review.\n\nCall to action: Request a sample review built on public data for your industry. No dashboard login required; we will bring the conversation to you.`,
  },
  {
    title: "Interview notes — win/loss review, Ostrander Foods RFP (Aug 24, 2026)",
    kind: "interview_notes",
    body: `Win/loss interview, August 24, 2026, with Elena Voss, VP Supply Chain at Ostrander Foods, six weeks after they chose Cartwright Partners over us for their distribution-network study. She agreed to thirty minutes; these notes go to the whole team. Why we lost, in order of weight as she told it. First, Cartwright brought a named team to the final presentation; we brought two partners who "would staff it after signature." She needed to know who would be in her building. Second, our proposal priced the whole study as one number; Cartwright split diagnosis from design, letting her buy a smaller first commitment. Third — and she volunteered this — our references were all financial services; Cartwright showed two food-and-beverage logos. What we did well: she said our diagnostic questions in the second meeting were the sharpest of the three firms, and she kept our network-mapping one-pager. She would include us in the implementation RFP in Q1 2027 if we bring a named team. Actions: name teams in every proposal from today; restructure proposals into a small diagnosis phase plus a larger design phase; prioritize getting one food-and-beverage reference this fall.`,
  },
  {
    title: "Sales kickoff briefing notes — Q4 push (Sep 1, 2026)",
    kind: "other",
    body: `Briefing notes for the September 4, 2026 sales kickoff, prepared September 1 by Kofi Mensah. Purpose: align the team on the Q4 selling season, which decides our year.\n\nThe number: $1.1M in bookings by December 19. We enter September with $700k weighted pipeline, so this is achievable but has no slack for slippage.\n\nThree plays for the quarter. Play one: Benchmarking launch. The October budget-lock deadline we heard at the CFO summit means every benchmarking conversation must reach a proposal by October 10. Marketing has the landing page in review; sales gets the sample-review offer as the standard opener. Play two: renewals reframed as new scopes. The Vantage conversation is the template — do not sell year three of the same thing; find the 2027 problem and scope to it. Every renewal owner brings a "2027 problem hypothesis" to pipeline review. Play three: the Bluepeak channel. Referrals will trickle, not flood; treat each one as a reference-building opportunity, not quick revenue.\n\nHousekeeping: proposals now name the delivery team on page one, per the Ostrander loss review. No exceptions, including small scopes.`,
  },
];

// --- helpers -----------------------------------------------------------------

async function getOrCreateOrg(name: string): Promise<string> {
  const existing = await admin
    .from("organizations")
    .select("id, name")
    .eq("name", name)
    .limit(1);
  failIf(existing.error, `looking up organization "${name}"`);
  if (existing.data && existing.data.length > 0) {
    console.log(`Organization "${name}" already exists.`);
    return existing.data[0].id;
  }
  const inserted = await admin
    .from("organizations")
    .insert({ name })
    .select("id")
    .single();
  failIf(inserted.error, `creating organization "${name}"`);
  console.log(`Created organization "${name}".`);
  return inserted.data!.id;
}

async function getOrCreateUser(email: string): Promise<string> {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  failIf(listed.error, `listing users while looking for ${email}`);
  const found = listed.data.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
  );
  if (found) {
    console.log(`User ${email} already exists.`);
    if (passwordFromEnv) {
      // Re-runs converge: when SEED_USER_PASSWORD is set, an existing user's
      // password is reset to it so the probe can always sign in.
      const updated = await admin.auth.admin.updateUserById(found.id, {
        password: seedPassword,
      });
      failIf(updated.error, `updating password for existing user ${email}`);
      console.log(`Password for ${email}: set (reset from SEED_USER_PASSWORD).`);
    }
    return found.id;
  }
  const created = await admin.auth.admin.createUser({
    email,
    password: seedPassword,
    email_confirm: true,
  });
  failIf(created.error, `creating user ${email}`);
  console.log(`Created user ${email}.`);
  return created.data.user!.id;
}

async function ensureMembership(orgId: string, userId: string): Promise<void> {
  const existing = await admin
    .from("org_members")
    .select("org_id, user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .limit(1);
  failIf(existing.error, `looking up membership ${userId} in ${orgId}`);
  if (existing.data && existing.data.length > 0) {
    console.log(`Membership already exists for user ${userId}.`);
    return;
  }
  const inserted = await admin
    .from("org_members")
    .insert({ org_id: orgId, user_id: userId });
  failIf(inserted.error, `creating membership ${userId} in ${orgId}`);
  console.log(`Added user ${userId} to organization ${orgId}.`);
}

async function ensureDocument(
  orgId: string,
  userId: string,
  doc: SeedDocument
): Promise<void> {
  const existing = await admin
    .from("documents")
    .select("id, title")
    .eq("org_id", orgId)
    .eq("title", doc.title)
    .limit(1);
  failIf(existing.error, `looking up document "${doc.title}"`);
  if (existing.data && existing.data.length > 0) {
    console.log(`Document already exists: "${doc.title}"`);
    return;
  }
  const inserted = await admin.from("documents").insert({
    org_id: orgId,
    title: doc.title,
    kind: doc.kind,
    body: doc.body,
    added_by: userId,
  });
  failIf(inserted.error, `creating document "${doc.title}"`);
  console.log(`Created document: "${doc.title}"`);
}

// --- main --------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Seeding Signal Notes…");

  const northwindId = await getOrCreateOrg("Northwind Advisory");
  const meridianId = await getOrCreateOrg("Meridian Group");

  const anaId = await getOrCreateUser("ana@northwind-advisory.test");
  const martaId = await getOrCreateUser("marta@meridiangroup.test");

  await ensureMembership(northwindId, anaId);
  await ensureMembership(meridianId, martaId);

  for (const doc of northwindDocuments) {
    await ensureDocument(northwindId, anaId, doc);
  }
  for (const doc of meridianDocuments) {
    await ensureDocument(meridianId, martaId, doc);
  }

  if (passwordFromEnv) {
    console.log("Seed user password: set (from SEED_USER_PASSWORD).");
  } else {
    console.log(
      "Seed user password: set (generated for this run; it is not printed anywhere. " +
        "Set SEED_USER_PASSWORD in .env.local and re-run if the probe script needs to sign in.)"
    );
  }
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("FAILED: unexpected error during seeding:", err);
  process.exit(1);
});
