-- AI (OpenAI) settings, usage log and HR-reviewed action point drafts.
-- Applied to production 28 Sep 2026.

create table if not exists public.ai_settings (
  id int primary key default 1 check (id = 1),
  action_points_enabled boolean not null default true,
  include_names boolean not null default false,
  model text not null default 'gpt-6-luna',
  reasoning_effort text not null default 'low' check (reasoning_effort in ('none', 'low', 'medium', 'high')),
  max_output_tokens int not null default 600 check (max_output_tokens between 100 and 4000),
  monthly_budget_usd numeric(10, 2) not null default 10 check (monthly_budget_usd >= 0),
  action_points_prompt text,
  key_secret_id uuid,
  key_last4 text,
  key_set_at timestamptz,
  key_set_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id) on delete set null
);
insert into public.ai_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  review_id uuid references public.kpi_reviews(id) on delete set null,
  model text,
  status text not null check (status in ('ok', 'error', 'skipped')),
  reason text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(12, 6),
  triggered_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ai_runs_created_idx on public.ai_runs (created_at desc);

create table if not exists public.kpi_action_point_drafts (
  review_id uuid primary key references public.kpi_reviews(id) on delete cascade,
  content text not null,
  source text not null check (source in ('ai', 'hr')),
  model text,
  generated_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id) on delete set null
);

alter table public.kpi_reviews
  add column if not exists action_points_approved_at timestamptz,
  add column if not exists action_points_approved_by uuid references public.employees(id) on delete set null;

alter table public.ai_settings enable row level security;
alter table public.ai_runs enable row level security;
alter table public.kpi_action_point_drafts enable row level security;
create policy "HR manage AI settings" on public.ai_settings
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());
create policy "HR view AI runs" on public.ai_runs
  for select to authenticated using (public.hc_is_hr());
create policy "HR manage action point drafts" on public.kpi_action_point_drafts
  for all to authenticated using (public.hc_is_hr()) with check (public.hc_is_hr());
revoke all on public.ai_settings, public.ai_runs, public.kpi_action_point_drafts from anon;

-- Key handling via Supabase Vault — callable only by the service role.
create or replace function public.hc_ai_set_key(p_key text, p_last4 text, p_by uuid) returns void
  language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  select key_secret_id into sid from public.ai_settings where id = 1;
  if sid is not null and exists (select 1 from vault.secrets where id = sid) then
    perform vault.update_secret(sid, p_key);
  else
    sid := vault.create_secret(p_key, 'hr_portal_openai_key_' || replace(gen_random_uuid()::text, '-', ''), 'OpenAI API key for the HR portal');
  end if;
  update public.ai_settings
    set key_secret_id = sid, key_last4 = p_last4, key_set_at = now(), key_set_by = p_by
    where id = 1;
end $$;

create or replace function public.hc_ai_get_key() returns text
  language sql stable security definer set search_path = public, vault as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  where s.id = (select key_secret_id from public.ai_settings where id = 1)
$$;

create or replace function public.hc_ai_clear_key() returns void
  language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  select key_secret_id into sid from public.ai_settings where id = 1;
  if sid is not null then delete from vault.secrets where id = sid; end if;
  update public.ai_settings
    set key_secret_id = null, key_last4 = null, key_set_at = null, key_set_by = null
    where id = 1;
end $$;

revoke all on function public.hc_ai_set_key(text, text, uuid), public.hc_ai_get_key(), public.hc_ai_clear_key()
  from public, anon, authenticated;
grant execute on function public.hc_ai_set_key(text, text, uuid), public.hc_ai_get_key(), public.hc_ai_clear_key()
  to service_role;
