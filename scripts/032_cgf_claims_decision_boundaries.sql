do $$
declare definition text;
begin
 select pg_get_functiondef('public.cgf_claim_committee_action(text,uuid,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'where p.id=actor and p.is_active and r.is_active;','where p.id=actor and p.is_active and r.is_active and p.bank_id is null;');
 definition:=replace(definition,'terms->>''currency''<>''TJS''','terms->>''currency'' is distinct from ''TJS''');
 definition:=replace(definition,'update public.claim_committee_sittings set status=''closed'',closed_at=now() where id=sid;',
 'update public.claim_committee_sittings set status=''closed'',closed_at=now() where id=sid;
 select * into l from public.loan_applications where id=c.loan_id for update;
 if s.outcome=''rejected'' and l.status=''claim_pending'' then
   update public.loan_applications set status=''claim_rejected'' where id=l.id;
   insert into public.loan_application_history(loan_id,action,old_status,new_status,performed_by,notes) values(l.id,''status_change'',''claim_pending'',''claim_rejected'',actor,''Signed claims committee protocol ''||s.protocol_no);
 end if;');
 execute definition;
end $$;

create or replace function cgf_private.guard_claim_decision() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user not in ('anon','authenticated') then return new; end if;
 if tg_op='INSERT' then
   if new.status is null or new.status not in ('pending','submitted') or new.approved_amount is not null or new.paid_amount is not null or new.reviewed_by is not null or new.approved_date is not null or new.paid_date is not null or new.review_date is not null or new.review_notes is not null or new.resolution_notes is not null or new.payment_date is not null or new.payment_reference is not null then raise exception 'Submit a pending claim without decision or payment fields' using errcode='42501'; end if;
   new.submitted_by:=auth.uid();
 else
   if (to_jsonb(new)-array['updated_at','reason']) is distinct from (to_jsonb(old)-array['updated_at','reason']) or (new.reason is distinct from old.reason and old.status not in ('pending','submitted')) then raise exception 'Claim decisions and financial changes require an authorized transactional action' using errcode='42501'; end if;
 end if;
 if new.loan_application_id is distinct from new.loan_id or not exists(select 1 from public.loan_applications where id=new.loan_id and bank_id=new.bank_id) or new.claim_amount<=0 or new.claim_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Claim requires matching loan and bank and a positive amount' using errcode='23514'; end if;
 if coalesce(new.principal_claimed,0)<0 or coalesce(new.interest_claimed,0)<0 or coalesce(new.penalties_claimed,0)<0 or ((new.principal_claimed is not null or new.interest_claimed is not null or new.penalties_claimed is not null) and new.claim_amount<>coalesce(new.principal_claimed,0)+coalesce(new.interest_claimed,0)+coalesce(new.penalties_claimed,0)) then raise exception 'Claim components must be nonnegative and match the total' using errcode='23514'; end if;
 return new;
end $$;

create function cgf_private.guard_loan_claim_decision() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and (tg_op='INSERT' or new.status is distinct from old.status) and new.status in ('claim_paid','claim_rejected') then raise exception 'Claim outcomes require their authorized transaction, not a direct loan status change' using errcode='42501'; end if;
 return new;
end $$;
create trigger cgf_loan_claim_decision before insert or update on public.loan_applications for each row execute function cgf_private.guard_loan_claim_decision();
revoke all on function cgf_private.guard_loan_claim_decision() from public,anon,authenticated;
