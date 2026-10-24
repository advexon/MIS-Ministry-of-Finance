create or replace function public.current_user_role_code()
returns text language sql stable security definer set search_path = '' as $$
  select r.code::text from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid() and p.is_active and r.is_active
$$;

create or replace function public.is_kkg_secretary()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and p.is_active and r.is_active
      and r.code not in ('super_admin', 'prsf_admin', 'auditor', 'bank_admin', 'bank_officer')
      and (p.is_committee_secretary or r.code = 'kkg_secretary')
  )
$$;

do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('create policy cgf_active_writer_insert on public.%I as restrictive for insert to authenticated with check (coalesce(public.current_user_role_code() <> ''auditor'', false))', t.relname);
    execute format('create policy cgf_active_writer_update on public.%I as restrictive for update to authenticated using (coalesce(public.current_user_role_code() <> ''auditor'', false)) with check (coalesce(public.current_user_role_code() <> ''auditor'', false))', t.relname);
    execute format('create policy cgf_active_writer_delete on public.%I as restrictive for delete to authenticated using (coalesce(public.current_user_role_code() <> ''auditor'', false))', t.relname);
  end loop;
  for t in
    select unnest(array['committee_meetings', 'committee_meeting_members', 'committee_agenda_items', 'committee_votes']) as relname
  loop
    execute format('create policy cgf_no_admin_insert on public.%I as restrictive for insert to authenticated with check (coalesce(public.current_user_role_code() not in (''super_admin'', ''prsf_admin''), false))', t.relname);
    execute format('create policy cgf_no_admin_update on public.%I as restrictive for update to authenticated using (coalesce(public.current_user_role_code() not in (''super_admin'', ''prsf_admin''), false)) with check (coalesce(public.current_user_role_code() not in (''super_admin'', ''prsf_admin''), false))', t.relname);
    execute format('create policy cgf_no_admin_delete on public.%I as restrictive for delete to authenticated using (coalesce(public.current_user_role_code() not in (''super_admin'', ''prsf_admin''), false))', t.relname);
  end loop;
end $$;

create or replace function public.cgf_guard_admin_decision()
returns trigger language plpgsql set search_path = '' as $$
declare actor text; protected_fields text[]; field text;
begin
  actor := public.current_user_role_code();
  if actor not in ('super_admin', 'prsf_admin') or actor is null then return new; end if;
  if tg_table_name = 'loan_applications' then
    protected_fields := array['status', 'current_step', 'approved_amount', 'approved_by', 'guarantee_amount', 'guarantee_coverage', 'loan_approval_date', 'guarantee_issued_date', 'guarantee_number', 'reschedule_approved_by', 'extension_granted_date', 'settlement_amount', 'settlement_date'];
  else
    protected_fields := array['status', 'approved_amount', 'paid_amount', 'reviewed_by', 'approved_date', 'paid_date', 'review_date', 'review_notes', 'resolution_notes', 'payment_date', 'payment_reference'];
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Administrators cannot create application or claim decisions' using errcode = '42501';
  end if;
  foreach field in array protected_fields loop
    if (to_jsonb(new) -> field) is distinct from (to_jsonb(old) -> field) then
      raise exception 'Administrators cannot change decision field %', field using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create trigger cgf_guard_admin_decision before insert or update on public.loan_applications
for each row execute function public.cgf_guard_admin_decision();
create trigger cgf_guard_admin_decision before insert or update on public.claims
for each row execute function public.cgf_guard_admin_decision();

revoke all on function public.cgf_guard_admin_decision() from public, anon, authenticated;
revoke all on function public.current_user_role_code() from public, anon;
revoke all on function public.is_kkg_secretary() from public, anon;
grant execute on function public.current_user_role_code(), public.is_kkg_secretary() to authenticated;
