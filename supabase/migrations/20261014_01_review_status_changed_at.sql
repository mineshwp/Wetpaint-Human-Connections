-- When a KPI review was last moved to Published (active) / Completed.
-- Stamped by a trigger so every code path is covered. Reviews published before
-- this migration have no recorded date (NULL) and show no date in the UI.
alter table public.kpi_reviews add column if not exists status_changed_at timestamptz;

create or replace function public.hc_stamp_review_status_changed()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := case when new.status = 'draft' then null else now() end;
  end if;
  return new;
end $$;

drop trigger if exists hc_kpi_reviews_status_changed on public.kpi_reviews;
create trigger hc_kpi_reviews_status_changed
  before update on public.kpi_reviews
  for each row execute function public.hc_stamp_review_status_changed();
