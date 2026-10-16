-- Problem reports and ideas from users ("Report an Issue" / "Share an Idea" in
-- the sidebar). HR reviews them on /feedback. Screenshots live in a private
-- bucket; feedback_items.attachments holds [{ path, name, size, mime }].
-- Written and read by the API with the service role only: RLS on, no policies,
-- nothing granted to anon/authenticated (same as activity_log / error_log).
-- NOT YET APPLIED — run this, then add the feedback_notify_emails setting if
-- you want recipients other than all HR admins (Settings → Notifications).

create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind text not null check (kind in ('problem', 'idea')),
  title text not null,
  description text not null,
  links text[] not null default '{}',
  attachments jsonb not null default '[]'::jsonb,
  page_url text,
  user_agent text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'closed')),
  hr_note text,
  submitted_by uuid references public.employees(id) on delete set null,
  submitter_name text,
  submitter_email text
);

create index if not exists feedback_items_created_idx on public.feedback_items (created_at desc);
create index if not exists feedback_items_submitter_idx on public.feedback_items (submitted_by, created_at desc);

alter table public.feedback_items enable row level security;
revoke all on public.feedback_items from anon, authenticated;

-- Private bucket for the screenshots / images (10 MB each, images and PDF only).
-- No storage policies: the service role uploads via one-time signed URLs and HR
-- views them through short-lived signed URLs from the API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-attachments', 'feedback-attachments', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
