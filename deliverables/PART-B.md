# PART B — Ranked findings review: the campaigns PR

SOURCE: `deliverables/PART-B-SOURCE.md` — the campaigns PR exactly as it appears
in the Milestone 0 brief, committed unedited (sha256 `1cc9eee3…5605db`). Every
QUOTE below is copy-pasted from that file and can be diffed against it. Where a
fix or a verification names a file in *this* repo, that file is real and
committed; where I could not check something, it is in "What I could not
determine from this diff" at the end rather than asserted.

This review was produced late. The PR was in the brief from day zero and our
intake never filed it, so PART-B.md sat marked BLOCKED for the whole build.
That is catch #25 in `docs/catch-log.md`, and the intake rule that came out of
it is now in `CLAUDE.md`. The finding count below is not the point; the reason
it arrived late is the more interesting thing about it.

Scored against the ten rules in `CLAUDE.md` plus ordinary production sense.
**29 findings: 5 × S0, 11 × S1, 13 × S2.**

## Severity legend

- **S0 — blocks merge**: a leak, a data-loss path, a security hole.
- **S1 — fix this week**: a real bug with a workaround or a narrow blast radius.
- **S2 — cleanup**: correctness-neutral quality/consistency.

## Template per finding

```
### [S0|S1|S2] <one-sentence name of the concrete failure>
FIX (one line): <the change that closes it>
SHOW ME:
  - QUOTE: <the exact line(s) from the PR, verbatim>
  - WALKTHROUGH: <plain-English, step by step, how the failure plays out in
    production — no jargon, retellable from memory>
  - HOW YOU'D VERIFY: <the query/command/screenshot that proves it real>
```

Expect every finding to be challenged. The only valid answer is the quoted code
plus the failure story, never reassurance.

---

# S0 — blocks merge

### S0-1 The service-role key is shipped to every browser that opens the campaign list.
FIX (one line): use `lib/supabase/client.ts` (anon key) — or delete the block, since nothing in the file uses it.

SHOW ME:
- QUOTE (`components/campaign-list.tsx`, four lines under `"use client"`):
  ```tsx
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
  );
  ```
- WALKTHROUGH:
  1. `"use client"` at the top of the file means: this code is compiled into
     JavaScript and sent to the visitor's browser.
  2. `NEXT_PUBLIC_` is Next.js's phrase for "paste this value into that
     JavaScript". Anything with that prefix is public by definition — that is
     the entire meaning of the prefix.
  3. The service-role key is the database's master key. It is built for trusted
     servers and it deliberately ignores every row-security rule. Ignoring the
     rules is its job.
  4. So the master key is printed inside a file that any visitor downloads.
     Open the page, devtools, Network, find the bundle, search for the key.
     That is not hacking. That is reading.
  5. Holding that key, anyone — signed in or not, customer or stranger — can
     read, change, or delete every row of every table belonging to every
     customer, from their own laptop, without ever touching our app.
  6. There is a second outcome, and on day one it is the likely one: that
     variable does not exist in this project. `.env.example` defines only
     `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The `!`
     tells TypeScript "trust me, it's there". At runtime it is `undefined`,
     `createBrowserClient` throws while the module is still loading, and the
     page is blank. The code either leaks everything or crashes on load. There
     is no third outcome.
  7. And the variable is never used. `supabase` is declared and no other line
     in the file reads it. The worst secret in the system is published in
     support of a variable nobody calls.
- HOW YOU'D VERIFY:
  - `npm run constitution` → the KEY block. Two of its four checks fire on this
    one line (`scripts/constitution.sh:52-73`): the literal `SERVICE_ROLE`
    reference in client-reachable code, and a service key exposed through a
    `NEXT_PUBLIC_` variable. Both report `file:line` and fail the build.
  - Or downstream of the build: `npm run build && grep -r "SERVICE_ROLE" .next/static/`
    — the key comes back out of the bundle we shipped.
  - Rule: `CLAUDE.md` hard boundary — "The service-role key never appears in
    client code or any `NEXT_PUBLIC_` env var."

### S0-2 Any signed-in user can read every campaign belonging to every organization.
FIX (one line): `using (organization_id in (select private.user_org_ids()))`, the org-scoped pattern already used by every table in migration 0001.

SHOW ME:
- QUOTE (`20260901_campaigns.sql`):
  ```sql
  create policy campaigns_read on campaigns
    for select to authenticated using (true);
  ```
- WALKTHROUGH:
  1. Row-level security is the fence around each customer's rows. The policy is
     the rule that decides which rows you are allowed to see.
  2. This rule is `true`. A rule that says yes to everything, for anyone holding
     a valid login (`to authenticated` means "any signed-in user", not "the
     right signed-in user").
  3. Our product is multi-tenant. Two organizations today, more later. A user
     in Org A and a user in Org B both hold valid logins.
  4. The Org A user signs in normally. Their browser already holds a Supabase
     client and the public key — every page in the app has one.
  5. They ask the database for the campaigns table directly: one line in a
     devtools console, no API route involved. The fence checks the policy, the
     policy says `true`, and every campaign belonging to Org B comes back —
     names, `config`, and `ai_output`.
  6. The API route in this same PR *looks* like it prevents that, because it
     filters `.eq("user_id", user.id)`. But that filter is a courtesy applied
     by our own code, and an attacker is not obliged to use our code. The
     policy is the only part that is not optional, and the policy says yes.
  7. That is rule 1 — "org-scoped (not merely user-scoped)" — failing in the
     one place where it is load-bearing.
- HOW YOU'D VERIFY:
  - `npx tsx scripts/two-org-probe.ts` — the committed two-org probe signs in as
    both seeded users and asserts each sees only its own org. Extend it to
    campaigns and this policy fails it.
  - Or read the rule itself: `npx tsx scripts/db-query.ts "select policyname, cmd, qual from pg_policies where tablename='campaigns';"`
    → the `qual` column literally reads `true`.

### S0-3 The create endpoint copies the caller's raw JSON into the row, so the caller chooses their own organization.
FIX (one line): read only the fields the feature owns — `const { name, config } = body` — and set `organization_id` server-side from the user's membership (`lib/org.ts`).

SHOW ME:
- QUOTE (`app/api/campaigns/route.ts`):
  ```ts
  const body = await req.json();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({ ...body, user_id: user.id })
  ```
- WALKTHROUGH:
  1. `...body` means "take everything the caller sent me and make it the new
     row".
  2. The route then overwrites exactly one field: `user_id`. Every other column
     is whatever the caller typed.
  3. The table has columns the caller must never control: `organization_id`,
     `status`, `ai_output`, `created_at`, and `id`.
  4. So a user posts `{"name":"x","organization_id":"<Org B's id>"}` and the row
     lands inside Org B's data. Nothing checks whether they belong to Org B —
     not this route, and not the write policy either (S0-4).
  5. The same trick sets `ai_output` to any text they like. That text is then
     shown to that org's staff as something our AI produced. One tenant can put
     words in another tenant's AI's mouth.
  6. The same trick sets `id`, `created_at` and `status`, so record identity,
     audit timing and workflow state are all caller-controlled.
  7. The dangerous part is how ordinary it looks. `{ ...body, user_id: user.id }`
     reads like "the user's data, plus their id", and the one field it does pin
     down makes the line look careful.
- HOW YOU'D VERIFY: signed in as the Org A user,
  `curl -X POST "$URL/api/campaigns" -H 'content-type: application/json' -b "<session cookie>" -d '{"name":"planted","organization_id":"<ORG B UUID>","status":"sent"}'`
  then `npx tsx scripts/db-query.ts "select name, organization_id, status from campaigns where name='planted';"`
  — the row comes back stamped with Org B.

### S0-4 The write rule never mentions the organization, so the database cannot stop a cross-tenant write.
FIX (one line): scope it on the org — `using (organization_id in (select private.user_org_ids()))` with a matching `with check` — and split `for all` into per-operation policies as migration 0001 does.

SHOW ME:
- QUOTE (`20260901_campaigns.sql`):
  ```sql
  create policy campaigns_write on campaigns
    for all to authenticated
    using (user_id = auth.uid());
  ```
- WALKTHROUGH:
  1. This says: you may write a row if the row's `user_id` is you.
  2. It never mentions `organization_id`. The database has no opinion about
     which tenant the row belongs to.
  3. So the planted row from S0-3 — my `user_id`, Org B's `organization_id` —
     satisfies this rule completely. The fence waves it through, because the
     fence was only ever checking the name tag, never the building.
  4. Rule 1 says it in four words: "org-scoped (not merely user-scoped)".
     User-scoped is exactly and only what this is.
  5. There is a quieter second problem. `for all` includes select, and policies
     are permissive — they are OR'd together. So this policy grants reads too,
     independently of `campaigns_read`. If someone later fixes S0-2 by
     tightening `campaigns_read` and stops there, reads stay wide open through
     *this* policy. The leak would look fixed and would not be.
- HOW YOU'D VERIFY: `npx tsx scripts/db-query.ts "select policyname, cmd, qual, with_check from pg_policies where tablename='campaigns';"`
  — neither policy's `qual` or `with_check` contains the string `organization_id`.

### S0-5 The migration ends by dropping a column that does not exist, which makes the entire file refuse to run.
FIX (one line): delete the line — a destructive `drop column` never rides along with a create, and needs its own migration with a stated backup.

SHOW ME:
- QUOTE (`20260901_campaigns.sql`, last line):
  ```sql
  alter table campaigns drop column legacy_notes;
  ```
- WALKTHROUGH:
  1. The same file creates `campaigns` about twenty lines earlier, and the table
     it creates has no `legacy_notes` column. Read the column list: id,
     organization_id, user_id, name, status, config, ai_output, created_at.
  2. So the last line asks Postgres to drop something that is not there.
     Postgres answers `ERROR: column "legacy_notes" of relation "campaigns"
     does not exist`.
  3. Migrations run inside a single transaction, so that error rolls the whole
     file back. No tables. No policies. Nothing.
  4. Run it instead against a database where `campaigns` already exists, and the
     *first* statement fails instead — `relation "campaigns" already exists` —
     and again the whole file rolls back. There is no database in which this
     file applies successfully.
  5. That is precisely the failure rule 4 exists to prevent: the file is in git,
     the PR is approved, everyone believes the schema shipped, and the tables
     were never created. The app then 500s in production against tables that do
     not exist — and the route in this same PR reports that as an empty list
     with a 200 (S1-3), so even the outage looks calm.
  6. And if somebody "fixes" it by deleting the create statements and running
     just the drop against an older table that really does have `legacy_notes`,
     that column and every value in it are gone, irreversibly, with no backup
     step anywhere in the file.
- HOW YOU'D VERIFY:
  - Run it against a scratch database: `supabase db reset`, or
    `psql "$SCRATCH_DATABASE_URL" -1 -f 20260901_campaigns.sql`, and read the
    error.
  - **UNPROVEN — stated, not hidden.** I did not execute it. This machine has
    no psql and no docker (`which psql` and `which docker` both return
    nothing), and the only database reachable from here is the live one, which
    is not a place to test destructive DDL. The claim rests on reading the
    file: the created table's column list contains no `legacy_notes`, which is
    checkable by eye in `deliverables/PART-B-SOURCE.md`.
  - Standing check afterwards: `npm run constitution` R4
    (`scripts/constitution.sh:128`) flags any committed migration with no
    tracking row in the live database — the ghost-migration detector catches
    "committed but never applied" the moment it happens.

---

# S1 — fix this week

### S1-1 The route imports a function that does not exist, so every request to it fails.
FIX (one line): `import { createClient } from "@/lib/supabase/server"` and `const supabase = await createClient();` — the helper is async.

SHOW ME:
- QUOTE (`app/api/campaigns/route.ts`, line 2 and the first line of each handler):
  ```ts
  import { createServerClient } from "@/lib/supabase/server";
  ...
  const supabase = createServerClient();
  ```
- WALKTHROUGH:
  1. `@/lib/supabase/server` is our own file. It exports exactly one thing:
     `export async function createClient()`.
  2. There is no `createServerClient` in it. That name belongs to the
     `@supabase/ssr` library, not to our wrapper around it. Someone wrote the
     import from memory.
  3. TypeScript rejects it outright, so this cannot reach production — which is
     the good news, and the reason this is S1 and not S0.
  4. If it did run, `createServerClient` would be `undefined`, and calling it
     throws `TypeError: createServerClient is not a function` on the first line
     of both GET and POST. The feature would be 100% down, not flaky.
  5. A second bug hides behind the first: our helper is `async`. Even with the
     name corrected, `const supabase = createClient()` without `await` returns a
     Promise, and `supabase.auth` is `undefined`. Fixing only the name moves the
     crash down one line.
  6. This is the classic "hallucinated API" — plausible name, real library,
     wrong module — and catching it is exactly what the typecheck gate is for.
- HOW YOU'D VERIFY — run in this repo, output pasted verbatim:
  ```
  $ npx tsc --noEmit
  partb-import-probe.ts(2,10): error TS2724: '"@/lib/supabase/server"' has no
  exported member named 'createServerClient'. Did you mean 'createClient'?
  ```
  (A three-line probe file containing only that import, typechecked here and
  deleted immediately after; it was never committed. The export surface is
  confirmable on its own with `grep -n "^export" lib/supabase/server.ts` →
  `export async function createClient() {`.)

### S1-2 "All sent" appears on screen when every single send failed.
FIX (one line): count real successes — `r.status === "fulfilled" && r.value.ok` — and report the true number ("3 of 12 sent, 9 failed").

SHOW ME:
- QUOTE (`components/campaign-list.tsx`):
  ```tsx
  const results = await Promise.allSettled(
    campaigns.map((c) =>
      fetch(`/api/campaigns/${c.id}/send`, { method: "POST" })
    )
  );
  const ok = results.filter((r) => r.status === "fulfilled");
  if (ok.length > 0) setSent(true);
  ```
- WALKTHROUGH:
  1. `fetch` counts "the server answered" as success. A 500 error page is an
     answer. A 401 "you are logged out" is an answer. Only a dead network is a
     failure.
  2. `allSettled` then marks every one of those "fulfilled". So `ok` counts
     *replies received*, not campaigns sent.
  3. The send endpoint could be returning 500 for all twelve campaigns, and all
     twelve land in `ok`.
  4. Then `ok.length > 0` — one is enough. Even under that already-wrong
     definition of success, one out of fifty flips the button.
  5. So the user clicks "Send all", reads "All sent", and walks away. Nothing
     was sent. There is no error state anywhere in this component, so nothing
     ever contradicts the button.
  6. The person who finds out is the customer asking why they never received
     the campaign, weeks later — and by then our own interface is on record
     saying it went.
- HOW YOU'D VERIFY: in devtools, make `/send` fail (block the route, or point it
  at a 500), click Send all, and watch the button read "All sent" above twelve
  red rows in the network panel.

### S1-3 A failed database read is served to the browser as "you have no campaigns", with a 200.
FIX (one line): destructure `{ data, error }` and return a 500 with the message when `error` is set.

SHOW ME:
- QUOTE (`app/api/campaigns/route.ts`, GET):
  ```ts
  const { data } = await supabase
    .from("campaigns")
    .select("*")
  ...
  return NextResponse.json({ campaigns: data ?? [] });
  ```
- WALKTHROUGH:
  1. supabase-js does not throw when a query fails. It hands back an object with
     an `error` inside it. If you never look at `error`, you never find out.
  2. This line takes `data` and discards `error` completely.
  3. When the query fails — the policy refuses it, the table is missing because
     the migration never applied (S0-5), the connection pool is exhausted —
     `data` comes back `null`.
  4. `data ?? []` turns that `null` into an empty list, and the route replies
     `200 OK` with `{"campaigns": []}`. A total failure, dressed as a perfectly
     normal, successful, empty answer.
  5. The screen then tells a user with forty campaigns: "No campaigns yet —
     create one!"
  6. And the damage isn't only the wrong screen. The user's obvious next move is
     to create the campaign they already have. Duplicates, generated by an
     outage the system reported as calm.
  7. Rule 3 covers writes; this is its read-side twin, and rule 9 names the
     outcome exactly: "a non-2xx NEVER renders as empty success". Here we do not
     even produce a non-2xx to ignore — we manufacture a 200.
- HOW YOU'D VERIFY: on a scratch database, `revoke select on campaigns from authenticated;`
  then call `/api/campaigns` and observe `200 {"campaigns":[]}` where a 500 belongs.

### S1-4 The event trail is written by a line that cannot succeed and never reports that it didn't.
FIX (one line): give `campaign_events` org-scoped select/insert policies (it needs its own `organization_id` first — S2-1) and check `{ error }` on the insert.

SHOW ME:
- QUOTE, the two halves of it. In `20260901_campaigns.sql`, security is switched
  on for the table and no policy is ever written for it:
  ```sql
  alter table campaign_events enable row level security;
  ```
  and in `app/api/campaigns/route.ts`:
  ```ts
  await supabase
    .from("campaign_events")
    .insert({ campaign_id: campaign.id, kind: "created" });
  ```
- WALKTHROUGH:
  1. Turning on row security with no policies is a locked door with no keys cut.
     Postgres's default is deny: security on, no rule permitting anything, so
     every read and write by a normal signed-in user is refused.
  2. `campaigns` got two policies. `campaign_events` got none. That is almost
     certainly an oversight, and it is invisible, because the SQL for "locked
     forever" and the SQL for "I wasn't finished yet" are the same SQL.
  3. The route writes to that table using the signed-in user's own credentials,
     so the write is refused.
  4. The refusal comes back as an `error` field on the returned object. This
     line never captures the result at all — `await` with nothing on the
     left-hand side. Nobody reads it. No log line, no exception, no alert.
  5. So every campaign is created successfully and its "created" event silently
     never exists. The activity trail is permanently empty, and it looks like a
     feature nobody uses rather than a feature that has never once worked.
  6. Whoever debugs this later starts from "the events table is empty" with no
     error anywhere to work from. The failure destroyed its own evidence.
- HOW YOU'D VERIFY:
  - `npm run constitution` → R1a fails. That check (`scripts/constitution.sh:112-125`)
    lists every public table with RLS enabled and no policy; `campaign_events`
    is exactly what that query returns.
  - And after creating a campaign through the app:
    `npx tsx scripts/db-query.ts "select count(*) from campaign_events;"` → 0.

### S1-5 The empty catch turns an AI failure into a normal-looking success.
FIX (one line): log the error and return it (`{ campaign, copy: null, copyError }`) so the UI can say the copy did not generate.

SHOW ME:
- QUOTE (`app/api/campaigns/route.ts`):
  ```ts
  let copy = null;
  try {
    copy = await generateCampaignCopy(campaign.id);
  } catch {}
  ```
- WALKTHROUGH:
  1. `catch {}` is the constitution's one absolutely-worded ban — rule 3, "No
     empty catch, ever."
  2. The model call is the single part of this route most likely to fail: rate
     limits, timeouts, a bad key, a provider outage.
  3. When it fails, the error is caught and put in the bin. Not logged, not
     counted, not returned, not retried.
  4. The route replies 200 with `copy: null`. To every dashboard, every metric
     and every log line, the request succeeded.
  5. The user gets a campaign with nothing in it and no explanation. This is a
     product whose entire value is the generated text, so "it worked, there is
     just nothing in it" is the least useful sentence we could produce.
  6. And because nothing is logged, if the provider is down for an hour we do
     not learn it from our own systems. We learn it from users.
- HOW YOU'D VERIFY: unset the model API key, POST a campaign, watch it return
  200 — then grep the server logs for any trace of the failure and find none.

### S1-6 The list ignores whether the request actually worked.
FIX (one line): `if (!res.ok) throw new Error(...)` before `.json()`, plus a `.catch` that sets an error state the component renders.

SHOW ME:
- QUOTE (`components/campaign-list.tsx`):
  ```tsx
  fetch("/api/campaigns")
    .then((res) => res.json())
    .then((data) => setCampaigns(data.campaigns ?? []));
  ```
- WALKTHROUGH:
  1. `res.ok` is never consulted. A 401, a 403, a 500 all flow into `.json()`
     exactly like a 200 would.
  2. Those responses carry `{"error":"unauthorized"}`. There is no `campaigns`
     key in them.
  3. `data.campaigns ?? []` quietly converts that into an empty list.
  4. Screen: "No campaigns yet — create one!". The true message was "you are
     signed out" or "the server is broken".
  5. There is also no `.catch` anywhere on the chain. If the network drops, the
     promise rejects with nobody listening — an unhandled rejection in the
     console, and the component sits on the empty state forever.
  6. Rule 9 in one line: "a non-2xx NEVER renders as empty success." Three
     different failures, one cheerful screen.
- HOW YOU'D VERIFY: sign out in a second tab, reload this page. The list shows
  the friendly empty state while the network panel shows 401.

### S1-7 Every user is told "No campaigns yet" on every page load, campaigns or not.
FIX (one line): a `loading` state initialised `true` that renders the skeleton, so the empty state can only appear after a request has actually completed.

SHOW ME:
- QUOTE (`components/campaign-list.tsx`):
  ```tsx
  const [campaigns, setCampaigns] = useState<any[]>([]);
  ...
  if (campaigns.length === 0) return <p>No campaigns yet — create one!</p>;
  ```
- WALKTHROUGH:
  1. The list starts as an empty array, because it has to start as something.
  2. The component renders before the network request comes back. That is always
     true — that is simply how the web works.
  3. On that first render `campaigns.length === 0`, so the code takes the empty
     branch.
  4. So everyone, including the customer with two hundred campaigns, is told
     "No campaigns yet — create one!" and then watches it flip.
  5. On a slow connection that lie is on screen long enough to act on, which is
     how you get a duplicate campaign created by a user who believed the screen.
  6. The component cannot tell the two situations apart because it stores one
     fact (the list) where it needs three: still loading, failed, genuinely
     empty. Our own boundary says all UI states are part of "done", not polish.
- HOW YOU'D VERIFY: devtools → Network → throttle to Slow 3G, reload as a user
  who has campaigns, and read what the screen says for the first second.

### S1-8 `select("*")` ships the config and the raw AI output to a list that draws one field.
FIX (one line): `.select("id, name, status, created_at")` — the columns the caller actually reads.

SHOW ME:
- QUOTE (`app/api/campaigns/route.ts`, GET):
  ```ts
  .select("*")
  ```
- WALKTHROUGH:
  1. `*` means every column, and this table has two JSON blobs with no size
     limit: `config` and `ai_output`.
  2. The screen it feeds renders `{c.name}`. One field.
  3. So every page load drags the complete generated text of every campaign
     across the network in order to draw a list of names. A hundred campaigns of
     a few thousand words each is megabytes, every load.
  4. It also puts all of that content into the browser of everyone who can list
     campaigns — which widens S0-2 from "names leaked" to "every tenant's
     generated content leaked".
  5. And when a column is added later it joins the payload silently. Nobody
     edits this line, so nobody re-reviews the decision.
  6. Rule 2 forbids it by name, and our verifier greps for it.
- HOW YOU'D VERIFY: `npm run constitution` → the R2 check
  (`scripts/constitution.sh:34`) fails with `file:line`.

### S1-9 The Send all button has no in-flight state, so a double click sends everything twice.
FIX (one line): a `sending` state that disables the button and changes its label for the duration.

SHOW ME:
- QUOTE (`components/campaign-list.tsx`):
  ```tsx
  <button onClick={sendAll}>{sent ? "All sent " : "Send all"}</button>
  ```
- WALKTHROUGH:
  1. Clicking starts a batch of network requests that take seconds.
  2. Nothing on screen changes while they run. Same label, still clickable, no
     spinner, no disabled state.
  3. So the natural human response to "nothing happened" is to click again.
  4. That fires the entire batch a second time. Nothing on the server makes a
     second send a no-op — no idempotency key, no status check before sending.
  5. In a campaigns product the unit of damage is a real message to a real
     recipient. The customer sees the duplicate; we don't.
  6. Rule 10 asks for loading states on mutation buttons for exactly this
     reason.
- HOW YOU'D VERIFY: throttle the network, click Send all twice, and count the
  requests in the network panel — two per campaign.

### S1-10 A malformed request body crashes the route into an unreadable 500.
FIX (one line): wrap `req.json()` and return a 400 carrying a readable message.

SHOW ME:
- QUOTE (`app/api/campaigns/route.ts`, POST):
  ```ts
  const body = await req.json();
  ```
- WALKTHROUGH:
  1. If the body is not valid JSON — empty, truncated by a dropped connection,
     or sent with the wrong content type — this throws.
  2. Nothing catches it, so the framework's last-resort handler produces its own
     error response.
  3. That response is not our JSON shape, and may not be JSON at all.
  4. Our client code everywhere assumes an error response carries a readable
     `error` string. Here it does not, so the browser shows nothing useful, and
     often nothing at all.
  5. It also lets any client produce 500s in our logs at will, which trains
     everybody to stop reading 500s in the logs.
  6. This repo has already been bitten by this exact shape — Change Card 015:
     "a platform kill returns an opaque non-JSON error page, breaking these
     routes' own promise that a non-2xx always carries a readable `error`".
- HOW YOU'D VERIFY: `curl -i -X POST "$URL/api/campaigns" -H 'content-type: application/json' -d ''`
  and read the response body.

### S1-11 The POST spends model tokens with no rate limit, no time limit, and no transaction around its four steps.
FIX (one line): put it behind the existing `lib/rate-limit.ts` bucket, declare `export const maxDuration`, and make the partial states recoverable (or move generation off the request).

SHOW ME:
- QUOTE (`app/api/campaigns/route.ts`):
  ```ts
  copy = await generateCampaignCopy(campaign.id);
  ```
- WALKTHROUGH:
  1. One POST does four things: insert a campaign, insert an event, call the
     model, reply. The model call is the expensive one, in money and in seconds.
  2. Any signed-in user can call it in a loop. There is no limiter on this
     route. This repo added `lib/rate-limit.ts` in Change Card 015 precisely
     because "an authenticated endpoint that spends model tokens" is the shape
     that gets abused.
  3. There is no `maxDuration` declared. A slow generation runs until the
     hosting platform kills it, and a platform kill returns an opaque error page
     — S1-10 again, arriving by a different road.
  4. The four steps are not atomic. The campaign inserts; the event write fails
     silently (S1-4); the model call fails silently (S1-5); the request returns
     200. We are left with half-built campaigns that no code path ever repairs,
     because no code path knows they are half-built.
  5. The cost is the visible symptom. The unrepairable half-built rows are the
     part that lasts.
- HOW YOU'D VERIFY: `for i in $(seq 1 50); do curl -X POST "$URL/api/campaigns" ... & done`
  against a staging deploy, then read the provider's usage dashboard for that
  minute.

---

# S2 — cleanup

### S2-1 `campaign_events` has no organization column, so it cannot be org-scoped without a join.
FIX (one line): add `organization_id uuid not null references organizations(id)` and scope its policies on it, as `briefing_sources` does.

SHOW ME:
- QUOTE (`20260901_campaigns.sql`):
  ```sql
  create table campaign_events (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references campaigns(id),
  ```
- WALKTHROUGH:
  1. Every child table in this repo carries its own org id — `briefing_sources`
     does — specifically so its security rule can be one cheap comparison.
  2. This table only knows its parent campaign.
  3. To answer "may you see this event?", the database must look up the
     campaign, then the campaign's org, for every row.
  4. That is slower, and — more importantly — fiddly enough to be skipped, which
     is how child tables end up with no policy at all. Which is what happened
     here (S1-4).
  5. The missing column is the reason the missing policy was easy to miss.
- HOW YOU'D VERIFY: read `briefing_sources` in
  `supabase/migrations/20260901000001_foundation.sql` — it carries `org_id` and
  its policies scope directly on it.

### S2-2 Deleting a campaign will fail, because its event rows hold it in place.
FIX (one line): `references campaigns(id) on delete cascade`.

SHOW ME:
- QUOTE: `campaign_id uuid not null references campaigns(id),`
- WALKTHROUGH:
  1. A foreign key with no `on delete` clause defaults to "refuse".
  2. So the moment a campaign has one event, deleting the campaign errors.
  3. The delete goes through supabase-js, which does not throw — and on this
     PR's habits the error would not be checked anyway — so the button appears
     to work and the row stays.
  4. The user deletes it again. And again.
  5. This repo made the on-delete decision deliberately elsewhere and wrote down
     why (`on delete set null` so audit lines survive what they describe). Here
     it was made by default, silently, and the default is the wrong one.
- HOW YOU'D VERIFY: `npx tsx scripts/db-query.ts "select conname, confdeltype from pg_constraint where conname like '%campaign_events%';"`
  → `a` (no action) where `c` (cascade) belongs.

### S2-3 `auth.uid()` is re-evaluated once per row.
FIX (one line): `(select auth.uid())`, as every policy in migration 0001 already does.

SHOW ME:
- QUOTE: `using (user_id = auth.uid());`
- WALKTHROUGH:
  1. Written bare, Postgres treats the function as something that might change
     from row to row, and calls it for every row it examines.
  2. Wrapped in a select, the planner lifts it out and calls it once per query.
  3. On a small table nobody notices. On a large one the security check becomes
     the slowest part of every query against it.
  4. This repo already standardised on the wrapped form, so this is also a
     consistency break — and the next person will copy it.
- HOW YOU'D VERIFY: `explain analyze` the same select under both forms against a
  seeded table.

### S2-4 No indexes on any of the columns these queries use.
FIX (one line): `create index on campaigns(organization_id, created_at desc);` plus one on `campaigns(user_id, created_at desc)` and one on `campaign_events(campaign_id)`.

SHOW ME:
- QUOTE: the migration contains no `create index` statement at all — the two
  `create table` blocks end at `created_at timestamptz not null default now()`.
- WALKTHROUGH:
  1. The list query filters on one column and sorts on another; the security
     policy filters on a third.
  2. With no index the database reads the entire table each time and sorts it in
     memory.
  3. That is invisible at ten rows, unnoticed at a thousand, and a support
     ticket at a hundred thousand.
  4. Foreign keys do not create an index on the referencing side. That
     assumption is common and expensive.
- HOW YOU'D VERIFY: `explain analyze select ... from campaigns where organization_id = '…' order by created_at desc;`
  → Seq Scan plus Sort.

### S2-5 `status` accepts any string at all.
FIX (one line): `check (status in ('draft','scheduled','sent','failed'))`.

SHOW ME:
- QUOTE: `status text not null default 'draft',`
- WALKTHROUGH:
  1. It is free text with a default and no constraint.
  2. The caller controls it directly (S0-3), so `"drafft"`, `"SENT"` and `""`
     all store happily.
  3. Every screen that filters or counts by status then silently drops or
     miscounts those rows.
  4. Bad status values never announce themselves. They just make the numbers
     wrong.
- HOW YOU'D VERIFY: insert a campaign with `"status":"nonsense"` and read it back.

### S2-6 No `updated_at`, so nothing can tell when a campaign last changed.
FIX (one line): add `updated_at timestamptz not null default now()` and the touch trigger migration 0003 already installs for other tables.

SHOW ME:
- QUOTE: `created_at timestamptz not null default now()` — and no sibling column.
- WALKTHROUGH:
  1. Only creation time exists.
  2. Campaigns are edited: status changes, config changes, AI output is written.
  3. None of it leaves a mark. "Recently changed" cannot be built, caching and
     sync have nothing to compare, and support cannot answer "when did this
     change?"
  4. This repo already hit the neighbouring bug — Change Card 015 records an
     `updated_at` that existed but was never written, so it stayed equal to
     `created_at` forever. Here the column is simply absent.
- HOW YOU'D VERIFY: `npx tsx scripts/db-query.ts "select column_name from information_schema.columns where table_name='campaigns';"`

### S2-7 The migration filename breaks the repo's convention, and the filename is the ordering.
FIX (one line): rename to `20260901000005_campaigns.sql`.

SHOW ME:
- QUOTE: `## migration: 20260901_campaigns.sql`
- WALKTHROUGH:
  1. Every migration in this repo is a 14-digit timestamp:
     `20260901000001_foundation.sql` through `20260901000004_document_types.sql`.
  2. Migrations apply in filename order, so the name *is* the ordering.
  3. An 8-digit name sorts unpredictably against 14-digit ones, and against any
     tooling that expects the full stamp.
  4. A migration that runs before the thing it depends on fails in a way that
     reads like a code bug, and gets debugged as one.
- HOW YOU'D VERIFY: `ls supabase/migrations/` beside this filename.

### S2-8 The generated copy is returned with no grounding, no feedback seam, and no narration.
FIX (one line): return and display the inputs the copy came from, store a rating/annotation against it, and narrate the generation while it runs.

SHOW ME:
- QUOTE: `return NextResponse.json({ campaign, copy });`
- WALKTHROUGH:
  1. The route generates text and hands it back. Nothing records or shows what
     the model was given.
  2. Rule 6 (glass box): a user cannot trace a sentence in the copy back to its
     source, so they can only trust it or not — which is the state we built this
     product to get out of.
  3. Rule 7: there is nowhere to say "this one was wrong", so nobody ever learns
     which prompts fail.
  4. Rule 8: generation happens inside a POST with no narration, so the user
     watches nothing at all until it returns.
  5. None of these will page anyone at 3am, which is why they sit in S2 — but
     all three are written into the constitution as merge-blocking, so this PR
     cannot merge on them either. Severity and mergeability are different
     questions and this finding is where they come apart.
- HOW YOU'D VERIFY: read the response shape — `{ campaign, copy }`. No sources
  field, no feedback endpoint, no event stream anywhere in the PR.

### S2-9 The component builds its own Supabase client instead of using the repo's, then never uses it.
FIX (one line): delete the block, or import `createClient` from `lib/supabase/client.ts`.

SHOW ME:
- QUOTE (`components/campaign-list.tsx`):
  ```tsx
  import { createBrowserClient } from "@supabase/ssr";
  ```
- WALKTHROUGH:
  1. `lib/supabase/client.ts` exists precisely so browser clients are built one
     way, with the anon key, under a comment saying the service key must never
     appear.
  2. This file walks around the wrapper and calls the library directly — which
     is what made S0-1 possible in the first place.
  3. Then it never uses the result. Dead code, carrying the worst secret in the
     system.
  4. A wrapper only protects you if using it is the easy path. Nothing here made
     it the easy path, so the wrapper protected nothing.
- HOW YOU'D VERIFY: search the file for a second occurrence of `supabase` — the
  variable is assigned once and read never.

### S2-10 `any[]` switches off type checking on the one shape that matters.
FIX (one line): a `Campaign` type matching the named columns from the corrected select.

SHOW ME:
- QUOTE: `const [campaigns, setCampaigns] = useState<any[]>([]);`
- WALKTHROUGH:
  1. `any` tells the compiler to stop asking questions.
  2. So `c.name` is unchecked. Rename the column and this still compiles, and
     renders `undefined` to the user.
  3. It pairs with `select("*")`: nobody knows what a campaign contains, and the
     type system has been instructed not to care.
  4. Rule 2's stated reason is that heavy columns "break typed inference" — here
     the inference had already been switched off by hand.
- HOW YOU'D VERIFY: rename `name` to `title` in the select and watch the build
  stay green.

### S2-11 The fetch does not abort on unmount.
FIX (one line): an `AbortController`, its `signal` passed to fetch, aborted in the effect's cleanup.

SHOW ME:
- QUOTE (`components/campaign-list.tsx`):
  ```tsx
  useEffect(() => {
    fetch("/api/campaigns")
  ```
- WALKTHROUGH:
  1. If the user navigates away before the reply arrives, the reply still
     arrives.
  2. It calls `setCampaigns` on a component that no longer exists — a wasted
     render at best, a warning normally, and stale data when the user returns.
  3. Rule 9's first clause is exactly this: client fetches abort on unmount.
  4. It only shows up with slow connections and fast users, which is why it
     survives testing and reaches customers.
- HOW YOU'D VERIFY: throttle to Slow 3G, open the page, navigate away
  immediately, and watch the console.

### S2-12 Raw HTML elements instead of the design system.
FIX (one line): the approved tokens and components from `docs/design/`.

SHOW ME:
- QUOTE (`components/campaign-list.tsx`):
  ```tsx
  {campaigns.map((c) => (
    <div key={c.id}>{c.name}</div>
  ))}
  ```
- WALKTHROUGH:
  1. Bare `div`, `p` and `button`, with no classes at all.
  2. The result inherits nothing: no spacing, no type scale, no focus ring, no
     dark mode.
  3. Our hard boundary says UI implements the approved tokens and components
     exactly, with no improvised styling.
  4. The button is the sharp end: with no accessible state, a screen-reader user
     hears "Send all" and gets no indication that anything is happening — the
     same lie as S1-9, told to the people least able to check it.
- HOW YOU'D VERIFY: render it beside any approved surface at 1440px, and tab to
  the button to look for the focus ring.

### S2-13 `req` is declared and never used.
FIX (one line): drop the parameter — `export async function GET()`.

SHOW ME:
- QUOTE: `export async function GET(req: Request) {`
- WALKTHROUGH:
  1. Small, but lint runs in this repo's verifier and in CI, and it stands at
     zero errors and zero warnings today (Change Card 015 got it there).
  2. This adds a warning, and a rule everyone agrees to ignore once is a rule
     that has stopped working.
  3. It is in the list because "exhaustive" has to include the boring one.
- HOW YOU'D VERIFY: `npm run lint`.

---

# What I could not determine from this diff

Not findings. Open questions, listed so nobody mistakes silence for a clean
bill of health.

1. **Rule 5, prompts in `lib/prompts/` only.** The route imports
   `generateCampaignCopy` from `@/lib/ai`, and that file is not in the PR. If
   the prompt is an inline string in there, it is an R5 violation. I am not
   asserting that it is — I have not seen the file. The check:
   `ls lib/prompts/` for a campaign prompt, and read `lib/ai/` for string
   literals.
2. **`/api/campaigns/[id]/send` is called but not included.** Everything I say
   in S1-2 is about how the client handles the *reply*, which is wrong
   regardless of what that route does. But whether the route exists at all is
   unknown — and if it does not, every send is a 404, which `Promise.allSettled`
   still calls "fulfilled", which still lights up "All sent".
3. **Schema naming against the real database.** This PR uses `organization_id`
   and a direct `references organizations(id)`. This repo's own tables use
   `org_id` and route membership through an `org_members` join table with the
   `private.user_org_ids()` helper. I would raise that in review, but without
   the intended schema I cannot call it a defect rather than a difference.

---

# Top 3, and why these three

**The ranking principle: silent beats loud, irreversible beats repairable, and
cross-tenant beats single-tenant.** A failure that announces itself gets fixed.
A failure that looks like success is still running six months later.

**1. S0-1 — the service-role key in the browser bundle.**
It is not a bug that can be exploited; it is a published master key. It defeats
every other control in the system simultaneously, including the fixes for the
two findings below — correct the policies all you like, the service key ignores
policies by design. And it is the only finding here with a cleanup cost *after*
the fix: the key is already in browsers, in CDN caches, and in any saved copy of
the bundle, so remediation is rotating the key and auditing what was done with
it, not editing a line. Everything else on this list is fixed by a commit. This
one is fixed by a commit plus an incident.

**2. S0-2 — `using (true)` on the read policy.**
This is the one guarantee the product sells. Multi-tenant means the fence, and
here the fence is made of nothing while looking exactly like a fence. It leaks
quietly and permanently, with no trace in any log, because every one of those
reads is a legitimate request from a properly authenticated user. Note the trap
it sets for review: the API route's `.eq("user_id", user.id)` makes the data
look contained, so a reviewer who reads the TypeScript and skims the SQL signs
this off honestly. It is designed, accidentally, to survive exactly the kind of
review most PRs get.

**3. S0-3 — `insert({ ...body, user_id: user.id })`.**
S0-2 lets a tenant *read* another tenant's data; this lets them *write into it*.
That is worse in one specific way: reading is passive and leaves the victim's
data intact, while writing plants content — including `ai_output` — that the
victim's own staff will read as something our system produced and trust
accordingly. It also does not need a devtools console. It is one ordinary POST
to our documented API, from the app, using the feature as built.

**Why the broken migration (S0-5) is not in the top 3**, since it is the first
thing you would actually hit: it fails loudly, immediately, and on the first
run. The transaction rolls back, the tables are not created, and nothing is
destroyed — `legacy_notes` does not exist on the table this file creates, so
there is nothing there to lose. A failure that stops the deployment is a failure
doing its job. It has to be fixed before anything ships, and it is not what I
would spend the review arguing about. By the same principle S1-2's "All sent"
is the highest-ranked non-S0 finding, because it is the purest instance of the
rule: a screen that states, in words, that work was done which was not done.
