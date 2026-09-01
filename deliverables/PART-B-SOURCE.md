# Part B source material: the campaigns PR, verbatim from Wren's brief email

Drop this file into the signal-notes workspace and tell the Analyst to execute
PART-B.md against it. This is the complete PR as sent in the Milestone 0 brief.

## migration: 20260901_campaigns.sql

```sql
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid not null references auth.users(id),
  name text not null,
  status text not null default 'draft',
  config jsonb not null default '{}',
  ai_output jsonb,
  created_at timestamptz not null default now()
);

create table campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  kind text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table campaigns enable row level security;
alter table campaign_events enable row level security;

create policy campaigns_read on campaigns
  for select to authenticated using (true);

create policy campaigns_write on campaigns
  for all to authenticated
  using (user_id = auth.uid());

alter table campaigns drop column legacy_notes;
```

## app/api/campaigns/route.ts

```ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateCampaignCopy } from "@/lib/ai";

export async function GET(req: Request) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({ ...body, user_id: user.id })
    .select("id, name, status")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from("campaign_events")
    .insert({ campaign_id: campaign.id, kind: "created" });

  let copy = null;
  try {
    copy = await generateCampaignCopy(campaign.id);
  } catch {}

  return NextResponse.json({ campaign, copy });
}
```

## components/campaign-list.tsx

```tsx
"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
);

export function CampaignList() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((res) => res.json())
      .then((data) => setCampaigns(data.campaigns ?? []));
  }, []);

  async function sendAll() {
    const results = await Promise.allSettled(
      campaigns.map((c) =>
        fetch(`/api/campaigns/${c.id}/send`, { method: "POST" })
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    if (ok.length > 0) setSent(true);
  }

  if (campaigns.length === 0) return <p>No campaigns yet — create one!</p>;

  return (
    <div>
      {campaigns.map((c) => (
        <div key={c.id}>{c.name}</div>
      ))}
      <button onClick={sendAll}>{sent ? "All sent " : "Send all"}</button>
    </div>
  );
}
```
