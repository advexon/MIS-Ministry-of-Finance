begin;

create or replace function public.current_user_bank_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.bank_id from public.profiles p join public.roles r on r.id = p.role_id
  where p.id = auth.uid() and p.is_active and r.is_active
$$;
revoke all on function public.current_user_bank_id() from public, anon;
grant execute on function public.current_user_bank_id() to authenticated;

alter table public.fees enable row level security;
alter table public.recoveries enable row level security;
alter table public.loan_application_history enable row level security;
revoke all on public.fees, public.recoveries, public.loan_application_history from anon;
revoke insert, update, delete, truncate, references, trigger on public.loan_application_history from authenticated;
grant select on public.loan_application_history to authenticated;
revoke delete, truncate, references, trigger on public.fees, public.recoveries from authenticated;
grant select, insert, update on public.fees to authenticated;
grant select, insert on public.recoveries to authenticated;
revoke update on public.recoveries from authenticated;

drop policy if exists fees_select on public.fees;
drop policy if exists fees_insert on public.fees;
drop policy if exists fees_update on public.fees;
create policy fees_select on public.fees for select to authenticated using (
  public.is_prsf_staff() or (
    public.current_user_role_code() in ('bank_admin', 'bank_officer')
    and bank_id = public.current_user_bank_id()
    and exists (select 1 from public.loan_applications l where l.id = fees.loan_id
      and l.bank_id = fees.bank_id
      and (fees.loan_application_id is null or fees.loan_application_id = l.id))
  )
);
create policy fees_insert on public.fees for insert to authenticated with check (
  public.current_user_role_code() in ('super_admin', 'prsf_admin', 'accountant')
  and exists (select 1 from public.loan_applications l where l.id = fees.loan_id
    and l.bank_id = fees.bank_id
    and (fees.loan_application_id is null or fees.loan_application_id = l.id))
);
create policy fees_update on public.fees for update to authenticated using (
  public.current_user_role_code() in ('super_admin', 'prsf_admin', 'accountant')
) with check (
  public.current_user_role_code() in ('super_admin', 'prsf_admin', 'accountant')
  and exists (select 1 from public.loan_applications l where l.id = fees.loan_id
    and l.bank_id = fees.bank_id
    and (fees.loan_application_id is null or fees.loan_application_id = l.id))
);

drop policy if exists recoveries_select on public.recoveries;
drop policy if exists recoveries_insert on public.recoveries;
create policy recoveries_select on public.recoveries for select to authenticated using (
  public.is_prsf_staff() or (
    public.current_user_role_code() in ('bank_admin', 'bank_officer')
    and exists (select 1 from public.claims c join public.loan_applications l on l.id = c.loan_id
      where c.id = recoveries.claim_id and c.bank_id = public.current_user_bank_id()
      and l.bank_id = c.bank_id and recoveries.loan_id = l.id
      and (c.loan_application_id is null or c.loan_application_id = l.id)
      and (recoveries.loan_application_id is null or recoveries.loan_application_id = l.id))
  )
);
create policy recoveries_insert on public.recoveries for insert to authenticated with check (
  public.current_user_role_code() in ('super_admin', 'prsf_admin', 'accountant')
  and exists (select 1 from public.claims c join public.loan_applications l on l.id = c.loan_id
    where c.id = recoveries.claim_id and l.bank_id = c.bank_id and recoveries.loan_id = l.id
    and (c.loan_application_id is null or c.loan_application_id = l.id)
    and (recoveries.loan_application_id is null or recoveries.loan_application_id = l.id))
);

drop policy if exists history_select on public.loan_application_history;
drop policy if exists history_insert on public.loan_application_history;
create policy history_select on public.loan_application_history for select to authenticated using (
  public.is_prsf_staff() or (
    public.current_user_role_code() in ('bank_admin', 'bank_officer')
    and exists (select 1 from public.loan_applications l where l.id = loan_application_history.loan_id
      and l.bank_id = public.current_user_bank_id())
  )
);

commit;
