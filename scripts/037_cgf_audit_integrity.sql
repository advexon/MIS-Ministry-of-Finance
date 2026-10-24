begin;

alter table public.audit_trail enable row level security;
revoke all on public.audit_trail from public, anon, authenticated;
grant select, insert on public.audit_trail to authenticated;

drop policy if exists audit_trail_select on public.audit_trail;
drop policy if exists audit_trail_insert on public.audit_trail;
drop policy if exists cgf_active_writer_insert on public.audit_trail;
drop policy if exists cgf_active_writer_update on public.audit_trail;
drop policy if exists cgf_active_writer_delete on public.audit_trail;

create policy audit_trail_select on public.audit_trail
for select to authenticated using (public.is_prsf_staff());

create policy audit_trail_insert on public.audit_trail
for insert to authenticated with check (
  changed_by = (select auth.uid())
  and public.current_user_role_code() is not null
  and public.current_user_role_code() <> 'auditor'
);

commit;
