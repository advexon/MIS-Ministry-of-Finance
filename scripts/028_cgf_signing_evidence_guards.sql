create function public.cgf_deputy_confirmation_current(p_loan uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.is_prsf_staff() and coalesce((select terms=cgf_private.loan_signing_terms(p_loan) from public.deputy_confirmations where loan_id=p_loan order by confirmed_at desc limit 1),false) $$;
revoke all on function public.cgf_deputy_confirmation_current(uuid) from public,anon;
grant execute on function public.cgf_deputy_confirmation_current(uuid) to authenticated;
drop policy management_decisions_insert on public.management_decisions;
create policy management_decisions_insert on public.management_decisions for insert to authenticated with check(public.current_user_role_code()='fkg_management' and decided_by=auth.uid() and public.cgf_deputy_confirmation_current(loan_id) and exists(select 1 from public.loan_applications l where l.id=loan_id and l.status='management_review'));
create function cgf_private.guard_immutable_decision() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Recorded confirmations and decisions are immutable; record a new review' using errcode='23514'; end $$;
create trigger cgf_deputy_confirmation_immutable before update or delete on public.deputy_confirmations for each row execute function cgf_private.guard_immutable_decision();
create trigger cgf_management_decision_immutable before update or delete on public.management_decisions for each row execute function cgf_private.guard_immutable_decision();
create function cgf_private.guard_signed_loan_status() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status='approved' then
  if public.current_user_role_code() is distinct from 'fkg_management' or not public.cgf_deputy_confirmation_current(new.id) or not exists(select 1 from public.management_decisions where loan_id=new.id and decision='approved' and decided_by=auth.uid()) then raise exception 'Director approval after a current deputy confirmation is required' using errcode='42501'; end if;
 end if;
 if new.status is distinct from old.status and new.status='guarantee_issued' then
  if not public.cgf_has_signing_authority() or not exists(select 1 from public.guarantee_letters where loan_id=new.id and guarantee_number=new.guarantee_number and issued_by_user_id=auth.uid()) then raise exception 'Use the authorized atomic guarantee-signing operation' using errcode='42501'; end if;
 end if;
 return new;
end $$;
create trigger cgf_signed_loan_status before update on public.loan_applications for each row execute function cgf_private.guard_signed_loan_status();
revoke all on function cgf_private.guard_immutable_decision(),cgf_private.guard_signed_loan_status() from public,anon,authenticated;
