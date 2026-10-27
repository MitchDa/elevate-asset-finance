-- Williams & Co Asset Finance: online application leads
-- Run once in the Supabase SQL editor (project region: Sydney, ap-southeast-2).

create table if not exists public.leads (
  id                   uuid primary key,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  status               text not null default 'in_progress' check (status in ('in_progress', 'complete', 'contacted', 'closed')),
  path                 text,          -- 'Personal use' or 'Business use'
  first_name           text,
  mobile               text,
  email                text,
  suburb               text,
  state                text,
  asset                text,
  amount               numeric,
  best_time            text,
  percent              integer,
  answers              jsonb not null default '{}'::jsonb,   -- every answer, keyed by question id
  summary              jsonb not null default '{}'::jsonb,   -- broker summary: rows, flags, to-do, plain text notes
  consent_at           timestamptz,   -- when the customer accepted the privacy collection notice
  completed_at         timestamptz,
  notified_complete_at timestamptz,
  notified_partial_at  timestamptz,
  source               text,           -- e.g. youtube-novated, from the short link they clicked
  source_page          text,
  referrer             text,
  user_agent           text,
  broker_notes         text           -- for you to fill in once you've called them
);

create index if not exists leads_status_updated_idx on public.leads (status, updated_at desc);

-- Lock the table down. With RLS on and no policies, only the service role key
-- (held by the Netlify function, never the browser) can read or write.
alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

-- Retention: delete leads that never proceeded after 2 years.
-- Confirm the period with your compliance contact, then schedule it with pg_cron:
--   select cron.schedule('purge-stale-leads', '0 3 * * 0',
--     $$delete from public.leads where status in ('in_progress','closed') and updated_at < now() - interval '2 years'$$);

-- Already ran an earlier version of this file? Add the source column with:
-- alter table public.leads add column if not exists source text;
