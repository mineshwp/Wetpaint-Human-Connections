-- Two-way feedback + announcements.
--   feedback_messages  : the conversation on a problem report / idea (HR replies,
--                        the person replies back, and a line each time HR changes
--                        the status). Service role only.
--   feedback_items     : two new columns so the person gets an "unread" badge.
--   announcements      : "What's New" messages HR posts for everyone.
--   announcement_reads : who has opened which announcement (drives the badge).
-- Everything is read and written by the API with the service role: RLS on, no
-- policies, nothing granted to anon/authenticated (like activity_log).
-- NOT YET APPLIED.

alter table public.feedback_items
  add column if not exists last_hr_activity_at timestamptz,
  add column if not exists submitter_read_at timestamptz;

create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.feedback_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 'reply' = a written message; 'status' = HR changed the status (body = new status key)
  kind text not null check (kind in ('reply', 'status')),
  from_hr boolean not null,
  author_id uuid references public.employees(id) on delete set null,
  author_name text,
  body text not null
);
create index if not exists feedback_messages_item_idx on public.feedback_messages (item_id, created_at);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  author_name text,
  title text not null,
  body text not null,
  link_url text,
  email_requested boolean not null default false,
  emailed_count int not null default 0
);
create index if not exists announcements_created_idx on public.announcements (created_at desc);

-- Surrogate id + unique index (a two-FK composite key would make PostgREST
-- treat this as a many-to-many junction and break embeds).
create table if not exists public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  read_at timestamptz not null default now()
);
create unique index if not exists announcement_reads_unique on public.announcement_reads (announcement_id, employee_id);
create index if not exists announcement_reads_employee_idx on public.announcement_reads (employee_id);

alter table public.feedback_messages enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
revoke all on public.feedback_messages from anon, authenticated;
revoke all on public.announcements from anon, authenticated;
revoke all on public.announcement_reads from anon, authenticated;
