create table public.claim_committee_sittings (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references public.claims(id),
 meeting_no text not null check (length(trim(meeting_no)) between 1 and 100),
 secretary_id uuid not null references public.profiles(id),
 status text not null default 'scheduled' check (status in ('scheduled','signing','closed','cancelled')),
 original_terms jsonb not null,
 claim_terms jsonb not null,
 original_amount_tjs numeric not null check (original_amount_tjs>0),
 director_threshold_tjs numeric not null check (director_threshold_tjs>0),
 recommended_amount numeric not null check (recommended_amount>0),
 outcome text check (outcome in ('approved','rejected')),
 protocol_no text,
 protocol_notes text,
 protocol_snapshot jsonb,
 created_at timestamptz not null default now(),
 closed_at timestamptz
);
create unique index claim_committee_one_open on public.claim_committee_sittings(claim_id) where status in ('scheduled','signing');
create table public.claim_committee_members (
 id uuid primary key default gen_random_uuid(),
 sitting_id uuid not null references public.claim_committee_sittings(id),
 member_id uuid not null references public.profiles(id),
 role_code text not null check (role_code in ('prsf_analyst','credit_risk_officer','compliance_officer','fkg_management')),
 is_chair boolean not null default false,
 attended boolean not null default false,
 signed_at timestamptz,
 unique(sitting_id,member_id), unique(sitting_id,role_code)
);
create table public.claim_committee_votes (
 id uuid primary key default gen_random_uuid(),
 sitting_id uuid not null references public.claim_committee_sittings(id),
 member_id uuid not null,
 vote text not null check (vote in ('for','against','abstain')),
 voted_at timestamptz not null default now(),
 foreign key(sitting_id,member_id) references public.claim_committee_members(sitting_id,member_id),
 unique(sitting_id,member_id)
);
alter table public.claim_committee_sittings enable row level security;
alter table public.claim_committee_members enable row level security;
alter table public.claim_committee_votes enable row level security;
create policy claim_sittings_read on public.claim_committee_sittings for select to authenticated using (public.is_prsf_staff());
create policy claim_members_read on public.claim_committee_members for select to authenticated using (public.is_prsf_staff());
create policy claim_votes_read on public.claim_committee_votes for select to authenticated using (public.is_prsf_staff());
revoke all on public.claim_committee_sittings,public.claim_committee_members,public.claim_committee_votes from public,anon,authenticated;
grant select on public.claim_committee_sittings,public.claim_committee_members,public.claim_committee_votes to authenticated;

create function cgf_private.claim_terms(p_claim uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('claim_id',id,'loan_id',loan_id,'loan_application_id',loan_application_id,'bank_id',bank_id,'claim_amount',claim_amount,'principal_claimed',principal_claimed,'interest_claimed',interest_claimed,'penalties_claimed',penalties_claimed,'claim_date',claim_date,'reason',reason) from public.claims where id=p_claim
$$;

create function cgf_private.guard_claim_committee() returns trigger language plpgsql set search_path='' as $$
declare s text; sid uuid;
begin
 if tg_table_name='claim_committee_sittings' then
   if old.status in ('closed','cancelled') then raise exception 'Finalized claim sittings are immutable' using errcode='23514'; end if;
   if old.status='signing' and (to_jsonb(new)-array['status','closed_at']) is distinct from (to_jsonb(old)-array['status','closed_at']) then raise exception 'Claim protocol is frozen' using errcode='23514'; end if;
 else
   sid:=case when tg_op='INSERT' then new.sitting_id else old.sitting_id end;
   select status into s from public.claim_committee_sittings where id=sid for update;
   if s in ('closed','cancelled') then raise exception 'Finalized claim sittings are immutable' using errcode='23514'; end if;
   if s='signing' and not (tg_table_name='claim_committee_members' and tg_op='UPDATE' and (to_jsonb(new)-'signed_at')=(to_jsonb(old)-'signed_at') and (to_jsonb(old)->>'signed_at') is null and (to_jsonb(new)->>'signed_at') is not null) then raise exception 'Claim protocol is frozen' using errcode='23514'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger immutable_claim_sitting before update or delete on public.claim_committee_sittings for each row execute function cgf_private.guard_claim_committee();
create trigger immutable_claim_member before insert or update or delete on public.claim_committee_members for each row execute function cgf_private.guard_claim_committee();
create trigger immutable_claim_vote before insert or update or delete on public.claim_committee_votes for each row execute function cgf_private.guard_claim_committee();

create function public.cgf_claim_committee_action(p_action text,p_sitting uuid default null,p_data jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); rc text; secretary boolean; s public.claim_committee_sittings%rowtype; c public.claims%rowtype;
 l public.loan_applications%rowtype; sid uuid; terms jsonb; threshold numeric; original_amount numeric;
 amount numeric; member_role text; target uuid; chair uuid; cnt int; yes_count int; no_count int; decision text;
begin
 select r.code,p.is_committee_secretary into rc,secretary from public.profiles p join public.roles r on r.id=p.role_id where p.id=actor and p.is_active and r.is_active;
 if actor is null or rc is null or rc not in ('prsf_analyst','credit_risk_officer','compliance_officer','fkg_management') then raise exception 'Active operational committee authority required' using errcode='42501'; end if;
 if p_action='create' then
   if not coalesce(secretary,false) or rc='fkg_management' then raise exception 'Active operations secretary required' using errcode='42501'; end if;
   if length(trim(coalesce(p_data->>'meeting_no',''))) not between 1 and 100 then raise exception 'Meeting number required' using errcode='22023'; end if;
   select * into c from public.claims where id=(p_data->>'claim_id')::uuid for update;
   if not found or c.status not in ('pending','submitted','under_review','rejected') then raise exception 'Claim is not awaiting a decision' using errcode='23514'; end if;
   select * into l from public.loan_applications where id=c.loan_id for update;
   if not found or c.bank_id<>l.bank_id or (c.loan_application_id is not null and c.loan_application_id<>l.id) then raise exception 'Claim loan and bank must match' using errcode='23514'; end if;
   select metadata->'terms' into terms from public.guarantee_letters where loan_id=l.id and not revoked order by issued_date limit 1;
   if terms is null or terms->>'currency'<>'TJS' or terms->>'loan_id' is distinct from l.id::text or terms->>'bank_id' is distinct from c.bank_id::text then raise exception 'Original issued TJS loan terms are required; legacy or foreign-currency evidence must be reconciled first' using errcode='23514'; end if;
   original_amount:=(terms->>'approved_amount')::numeric;
   select value::numeric into threshold from public.system_settings where key='committee_director_threshold_tjs';
   amount:=(p_data->>'recommended_amount')::numeric;
   if original_amount is null or original_amount<=0 or original_amount::text in ('NaN','Infinity','-Infinity') or threshold is null or threshold<=0 then raise exception 'Original loan amount and Director threshold required' using errcode='23514'; end if;
   if amount is null or amount<=0 or amount::text in ('NaN','Infinity','-Infinity') or amount>c.claim_amount or amount>coalesce((terms->>'guarantee_amount')::numeric,0) then raise exception 'Proposed amount must be positive and within both claim and original guarantee amounts' using errcode='22023'; end if;
   insert into public.claim_committee_sittings(claim_id,meeting_no,secretary_id,original_terms,claim_terms,original_amount_tjs,director_threshold_tjs,recommended_amount)
   values(c.id,trim(p_data->>'meeting_no'),actor,terms,cgf_private.claim_terms(c.id),original_amount,threshold,amount) returning id into sid;
   foreach member_role in array array['credit_risk_officer','compliance_officer','prsf_analyst'] loop
     select p.id into target from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and p.is_claims_committee_member and r.code=member_role
     order by (select count(*) from public.claim_committee_members cm join public.claim_committee_sittings cs on cs.id=cm.sitting_id where cm.member_id=p.id and cs.status in ('scheduled','signing')),p.created_at,p.id limit 1;
     if target is null then raise exception 'Missing active flagged claims member for %',member_role using errcode='23514'; end if;
     insert into public.claim_committee_members(sitting_id,member_id,role_code) values(sid,target,member_role);
   end loop;
   if original_amount>threshold then
     select p.id into target from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and r.code='fkg_management' order by p.created_at,p.id limit 1;
     if target is null then raise exception 'Active Director required above original loan threshold' using errcode='23514'; end if;
     insert into public.claim_committee_members(sitting_id,member_id,role_code) values(sid,target,'fkg_management');
   end if;
   select p.id into chair from public.claim_committee_members cm join public.profiles p on p.id=cm.member_id where cm.sitting_id=sid order by case when cm.role_code='fkg_management' then 0 when p.is_department_head then 1 when p.specialist_level='chief_specialist' then 2 else 3 end,p.created_at,p.id limit 1;
   update public.claim_committee_members set is_chair=true where sitting_id=sid and member_id=chair;
   update public.claims set status='under_review' where id=c.id;
 else
   select * into s from public.claim_committee_sittings where id=p_sitting for update;
   if not found then raise exception 'Claim sitting not found' using errcode='22023'; end if;
   sid:=s.id;
   if s.status in ('closed','cancelled') then raise exception 'Finalized claim sittings are immutable; convene a new sitting' using errcode='23514'; end if;
   if p_action in ('attendance','prepare','issue','cancel') and (not coalesce(secretary,false) or s.secretary_id<>actor or rc='fkg_management') then raise exception 'Assigned active secretary required' using errcode='42501'; end if;
   if p_action in ('vote','sign') and not exists(select 1 from public.claim_committee_members cm join public.profiles p on p.id=cm.member_id where cm.sitting_id=sid and cm.member_id=actor and cm.role_code=rc and (p.is_claims_committee_member or rc='fkg_management')) then raise exception 'Assigned active claims member required' using errcode='42501'; end if;
   if p_action='attendance' then
     if s.status<>'scheduled' then raise exception 'Protocol frozen' using errcode='23514'; end if;
     update public.claim_committee_members set attended=(p_data->>'attended')::boolean where sitting_id=sid and member_id=(p_data->>'member_id')::uuid;
     if not found then raise exception 'Member not assigned' using errcode='22023'; end if;
   elsif p_action='vote' then
     if s.status<>'scheduled' or not exists(select 1 from public.claim_committee_members where sitting_id=sid and member_id=actor and attended) then raise exception 'Only present members can vote before protocol freeze' using errcode='23514'; end if;
     if p_data->>'vote' is null or p_data->>'vote' not in ('for','against','abstain') then raise exception 'Invalid vote' using errcode='22023'; end if;
     insert into public.claim_committee_votes(sitting_id,member_id,vote) values(sid,actor,p_data->>'vote') on conflict(sitting_id,member_id) do update set vote=excluded.vote,voted_at=now();
   elsif p_action='prepare' then
     if s.status<>'scheduled' or length(trim(coalesce(p_data->>'protocol_no',''))) not between 1 and 100 then raise exception 'Unfrozen sitting and protocol number required' using errcode='23514'; end if;
     select count(*) into cnt from public.claim_committee_members where sitting_id=sid;
     if cnt<>(case when s.original_amount_tjs>s.director_threshold_tjs then 4 else 3 end) or exists(select 1 from public.claim_committee_members where sitting_id=sid and not attended) then raise exception 'All required assigned members must attend' using errcode='23514'; end if;
     select count(*) filter(where vote='for'),count(*) filter(where vote='against') into yes_count,no_count from public.claim_committee_votes where sitting_id=sid;
     if yes_count<>cnt and no_count<>cnt then raise exception 'Unanimous for or against votes required from every assigned member' using errcode='23514'; end if;
     decision:=case when yes_count=cnt then 'approved' else 'rejected' end;
     update public.claim_committee_sittings set status='signing',outcome=decision,protocol_no=trim(p_data->>'protocol_no'),protocol_notes=p_data->>'notes',protocol_snapshot=jsonb_build_object('sitting_id',sid,'claim_id',s.claim_id,'outcome',decision,'recommended_amount',s.recommended_amount,'original_terms',s.original_terms,'claim_terms',s.claim_terms,'original_amount_tjs',s.original_amount_tjs,'director_threshold_tjs',s.director_threshold_tjs,'protocol_no',trim(p_data->>'protocol_no'),'notes',p_data->>'notes','members',(select jsonb_agg(to_jsonb(cm) order by cm.member_id) from public.claim_committee_members cm where sitting_id=sid),'votes',(select jsonb_agg(to_jsonb(v) order by member_id) from public.claim_committee_votes v where sitting_id=sid)) where id=sid;
   elsif p_action='sign' then
     if s.status<>'signing' or s.protocol_snapshot is null then raise exception 'Frozen protocol required' using errcode='23514'; end if;
     update public.claim_committee_members set signed_at=now() where sitting_id=sid and member_id=actor and signed_at is null;
     if not found then raise exception 'Unsigned assigned member required' using errcode='42501'; end if;
   elsif p_action='issue' then
     if s.status<>'signing' or s.protocol_snapshot is null or exists(select 1 from public.claim_committee_members where sitting_id=sid and signed_at is null) then raise exception 'All assigned members must sign' using errcode='23514'; end if;
     select * into c from public.claims where id=s.claim_id for update;
     if not found or c.status<>'under_review' or s.claim_terms is distinct from cgf_private.claim_terms(c.id) then raise exception 'Claim changed since sitting was convened' using errcode='40001'; end if;
     if not exists(select 1 from public.guarantee_letters where loan_id=c.loan_id and not revoked and metadata->'terms'=s.original_terms) then raise exception 'Original guarantee evidence is no longer valid' using errcode='23514'; end if;
     update public.claims set status=s.outcome,approved_amount=case when s.outcome='approved' then s.recommended_amount else null end,reviewed_by=actor,review_date=current_date,approved_date=case when s.outcome='approved' then current_date else null end,review_notes=s.protocol_notes,resolution_notes='Unanimous signed claims protocol '||s.protocol_no where id=c.id;
     update public.claim_committee_sittings set status='closed',closed_at=now() where id=sid;
   elsif p_action='cancel' then
     if s.status<>'scheduled' then raise exception 'Frozen protocol cannot be cancelled' using errcode='23514'; end if;
     update public.claim_committee_sittings set status='cancelled',closed_at=now() where id=sid;
   else raise exception 'Unknown claim committee action' using errcode='22023'; end if;
 end if;
 insert into public.audit_trail(table_name,record_id,action,changed_by,new_data) values('claim_committee_sittings',sid,'CLAIM_COMMITTEE_'||upper(p_action),actor,jsonb_build_object('sitting_id',sid,'input',p_data));
 return sid;
end $$;
revoke all on function public.cgf_claim_committee_action(text,uuid,jsonb) from public,anon;
grant execute on function public.cgf_claim_committee_action(text,uuid,jsonb) to authenticated;
revoke all on function cgf_private.claim_terms(uuid),cgf_private.guard_claim_committee() from public,anon,authenticated;

create function cgf_private.guard_claim_decision() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user not in ('anon','authenticated') then return new; end if;
 if tg_op='INSERT' then
   if new.status not in ('pending','submitted') or new.approved_amount is not null or new.paid_amount is not null or new.reviewed_by is not null or new.approved_date is not null or new.paid_date is not null or new.review_date is not null or new.payment_date is not null or new.payment_reference is not null then raise exception 'Submit a pending claim without decision or payment fields' using errcode='42501'; end if;
 else
   if (to_jsonb(new)-array['updated_at','reason']) is distinct from (to_jsonb(old)-array['updated_at','reason']) then raise exception 'Claim decisions and financial changes require an authorized transactional action' using errcode='42501'; end if;
 end if;
 if new.loan_application_id is distinct from new.loan_id or not exists(select 1 from public.loan_applications where id=new.loan_id and bank_id=new.bank_id) or new.claim_amount<=0 or new.claim_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Claim requires matching loan and bank and a positive amount' using errcode='23514'; end if;
 return new;
end $$;
create trigger cgf_claim_decision before insert or update on public.claims for each row execute function cgf_private.guard_claim_decision();
revoke all on function cgf_private.guard_claim_decision() from public,anon,authenticated;
