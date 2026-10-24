alter table public.loan_applications drop constraint loan_applications_status_check;
alter table public.loan_applications add constraint loan_applications_status_check check(status in ('draft','submitted','under_review','approved','rejected','guarantee_issued','extension_pending','cancelled','disbursed','active','settled','rescheduled','defaulted','claim_pending','claim_rejected','claim_paid','closed','uko_registration','docs_incomplete','eligibility_review','ineligible','assessment','risk_review','kkg_scheduled','kkg_review','verification','kkg_protocol','formal_application','uko_reconciliation','compliance_check','deputy_review','management_review'));
create table public.deputy_confirmations(id uuid primary key default gen_random_uuid(),loan_id uuid not null references public.loan_applications(id),confirmed_by uuid not null references public.profiles(id),confirmed_at timestamptz not null default now(),notes text not null check(length(trim(notes)) between 3 and 10000),terms jsonb not null);
create index on public.deputy_confirmations(loan_id,confirmed_at desc);
alter table public.deputy_confirmations enable row level security;
revoke all on public.deputy_confirmations from anon,authenticated;
grant select on public.deputy_confirmations to authenticated;
create policy deputy_confirmations_read on public.deputy_confirmations for select to authenticated using(public.is_prsf_staff());
create table public.signature_delegations(id uuid primary key default gen_random_uuid(),delegate_id uuid not null references public.profiles(id),starts_at timestamptz not null,ends_at timestamptz not null,reason text not null check(length(trim(reason)) between 3 and 2000),granted_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),revoked_at timestamptz,check(ends_at>starts_at and ends_at<=starts_at+interval '90 days'));
create index on public.signature_delegations(delegate_id,starts_at,ends_at) where revoked_at is null;
alter table public.signature_delegations enable row level security;
revoke all on public.signature_delegations from anon,authenticated;
grant select on public.signature_delegations to authenticated;
create policy signature_delegations_read on public.signature_delegations for select to authenticated using(delegate_id=auth.uid() or public.current_user_role_code() in ('super_admin','prsf_admin','auditor','fkg_management'));
create function cgf_private.loan_signing_terms(p_loan uuid) returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object('loan_id',l.id,'bank_id',l.bank_id,'borrower_id',l.borrower_id,'currency',l.currency,'approved_amount',l.approved_amount,'guarantee_amount',l.guarantee_amount,'guarantee_coverage',l.guarantee_coverage,'maturity_date',l.maturity_date,'protocol',(select m.protocol_snapshot from public.committee_meetings m join public.committee_agenda_items a on a.meeting_id=m.id where a.loan_id=l.id and m.status='closed' and a.outcome='recommend_approve' order by a.decided_at desc limit 1),'compliance',(select to_jsonb(c) from public.compliance_checks c where c.loan_id=l.id and c.status='submitted' order by c.created_at desc limit 1)) from public.loan_applications l where l.id=p_loan $$;
create function public.cgf_confirm_deputy(p_loan uuid,p_notes text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); l public.loan_applications%rowtype; result uuid; snapshot jsonb; nxt text;
begin
 if public.current_user_role_code() is distinct from 'deputy_director' then raise exception 'An active Deputy Director must confirm the file' using errcode='42501'; end if;
 select * into l from public.loan_applications where id=p_loan for update;
 if not found or l.status not in ('deputy_review','management_review','approved') then raise exception 'The file is not awaiting deputy review or signature' using errcode='23514'; end if;
 snapshot:=cgf_private.loan_signing_terms(p_loan);
 if snapshot->'protocol'='null'::jsonb or snapshot->'compliance'='null'::jsonb or snapshot#>>'{compliance,outcome}'='not_cleared' then raise exception 'A signed committee approval and submitted cleared compliance note are required' using errcode='23514'; end if;
 insert into public.deputy_confirmations(loan_id,confirmed_by,notes,terms) values(p_loan,actor,trim(p_notes),snapshot) returning id into result;
 nxt:=case when l.status='approved' then 'approved' else 'management_review' end;
 update public.loan_applications set status=nxt,current_step=case when nxt='approved' then current_step else 15 end where id=p_loan;
 insert into public.loan_application_history(loan_id,action,old_status,new_status,performed_by,notes) values(p_loan,'deputy_confirmation',l.status,nxt,actor,p_notes);
 insert into public.audit_trail(table_name,record_id,action,changed_by,new_data) values('deputy_confirmations',result,'DEPUTY_CONFIRMED',actor,jsonb_build_object('loan_id',p_loan));
 return result;
end $$;
create function public.cgf_manage_signature_delegation(p_delegate uuid default null,p_start timestamptz default null,p_end timestamptz default null,p_reason text default null,p_revoke uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if coalesce(public.current_user_role_code(),'') not in ('super_admin','prsf_admin') or auth.uid() is null then raise exception 'Active administrator required' using errcode='42501'; end if;
 if p_revoke is not null then update public.signature_delegations set revoked_at=now() where id=p_revoke and revoked_at is null returning id into result; if result is null then raise exception 'Active delegation not found' using errcode='22023'; end if;
 else
 if not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=p_delegate and p.is_active and r.is_active and r.code in ('deputy_director','prsf_analyst','credit_risk_officer','compliance_officer')) then raise exception 'Only an active operational employee or Deputy Director may receive signing authority' using errcode='23514'; end if;
 insert into public.signature_delegations(delegate_id,starts_at,ends_at,reason,granted_by) values(p_delegate,p_start,p_end,trim(p_reason),auth.uid()) returning id into result;
 end if;
 insert into public.audit_trail(table_name,record_id,action,changed_by,new_data) values('signature_delegations',result,case when p_revoke is null then 'DELEGATION_GRANTED' else 'DELEGATION_REVOKED' end,auth.uid(),jsonb_build_object('delegate_id',p_delegate,'starts_at',p_start,'ends_at',p_end,'reason',p_reason));
 return result;
end $$;
create function public.cgf_has_signing_authority() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_active and (r.code='fkg_management' or (r.code in ('deputy_director','prsf_analyst','credit_risk_officer','compliance_officer') and exists(select 1 from public.signature_delegations d where d.delegate_id=p.id and d.revoked_at is null and now()>=d.starts_at and now()<d.ends_at)))) $$;
create sequence public.cgf_guarantee_serial;
select setval('public.cgf_guarantee_serial',greatest(1,coalesce((select max(substring(guarantee_number from '-([0-9]+)$')::bigint) from (select guarantee_number from public.guarantee_letters union all select guarantee_number from public.loan_applications) n where guarantee_number ~ '-[0-9]{1,12}$'),0)+1),false);
create function public.cgf_issue_guarantee(p_loan uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.loan_applications%rowtype; confirmation public.deputy_confirmations%rowtype; letter public.guarantee_letters%rowtype; decision public.management_decisions%rowtype; number text; bank_code text; expiry timestamptz; actor uuid:=auth.uid();
begin
 if not public.cgf_has_signing_authority() then raise exception 'Active Director or unexpired signature delegation required' using errcode='42501'; end if;
 select * into l from public.loan_applications where id=p_loan for update;
 if not found then raise exception 'Application not found' using errcode='22023'; end if;
 select * into letter from public.guarantee_letters where loan_id=p_loan;
 if found then return jsonb_build_object('success',true,'already_exists',true,'guarantee_number',letter.guarantee_number,'issued_date',letter.issued_date); end if;
 if l.status<>'approved' then raise exception 'Only an approved application may be signed' using errcode='23514'; end if;
 select * into confirmation from public.deputy_confirmations where loan_id=p_loan order by confirmed_at desc limit 1;
 if not found or confirmation.terms is distinct from cgf_private.loan_signing_terms(p_loan) then raise exception 'A current Deputy Director confirmation of unchanged terms is required' using errcode='23514'; end if;
 if confirmation.confirmed_by=actor then raise exception 'Deputy confirmation and guarantee signature require different people' using errcode='42501'; end if;
 select * into decision from public.management_decisions where loan_id=p_loan order by decided_at desc limit 1;
 if not found or decision.decision<>'approved' then raise exception 'A recorded Director approval is required' using errcode='23514'; end if;
 if not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=decision.decided_by and r.code='fkg_management') then raise exception 'The approval must be recorded by the Director' using errcode='23514'; end if;
 select code into bank_code from public.banks where id=l.bank_id;
 if bank_code is null then raise exception 'Bank code missing' using errcode='23514'; end if;
 number:='GF-'||extract(year from now())::text||'-'||upper(bank_code)||'-'||lpad(nextval('public.cgf_guarantee_serial')::text,6,'0');
 expiry:=(l.maturity_date+interval '3 months') at time zone 'Asia/Dushanbe';
 insert into public.guarantee_letters(loan_id,guarantee_number,issued_date,valid_until_date,issued_by_user_id,metadata) values(p_loan,number,now(),expiry,actor,jsonb_build_object('deputy_confirmation_id',confirmation.id,'terms',confirmation.terms,'management_decision_id',decision.id)) returning * into letter;
 update public.loan_applications set guarantee_number=number,guarantee_issued_date=current_date,status='guarantee_issued',current_step=16 where id=p_loan;
 insert into public.loan_application_history(loan_id,action,old_status,new_status,performed_by,notes) values(p_loan,'guarantee_signed','approved','guarantee_issued',actor,number);
 insert into public.audit_trail(table_name,record_id,action,changed_by,new_data) values('guarantee_letters',letter.id,'GUARANTEE_SIGNED',actor,jsonb_build_object('loan_id',p_loan,'deputy_confirmation_id',confirmation.id,'guarantee_number',number));
 return jsonb_build_object('success',true,'guarantee_number',number,'issued_date',letter.issued_date,'valid_until_date',expiry);
end $$;
revoke all on function cgf_private.loan_signing_terms(uuid) from public,anon,authenticated;
revoke all on function public.cgf_confirm_deputy(uuid,text),public.cgf_manage_signature_delegation(uuid,timestamptz,timestamptz,text,uuid),public.cgf_has_signing_authority(),public.cgf_issue_guarantee(uuid) from public,anon;
grant execute on function public.cgf_confirm_deputy(uuid,text),public.cgf_manage_signature_delegation(uuid,timestamptz,timestamptz,text,uuid),public.cgf_has_signing_authority(),public.cgf_issue_guarantee(uuid) to authenticated;
revoke all on sequence public.cgf_guarantee_serial from public,anon,authenticated;
revoke insert on public.guarantee_letters from authenticated,anon;
drop policy guarantee_letters_select on public.guarantee_letters;
create policy guarantee_letters_select on public.guarantee_letters for select to authenticated using(public.is_prsf_staff() or exists(select 1 from public.loan_applications l where l.id=loan_id and l.bank_id=public.current_user_bank_id()));
