do $$ declare definition text; begin
 select pg_get_functiondef('cgf_private.guard_pipeline()'::regprocedure) into definition;
 definition:=replace(definition,'if new.status not in (''draft'',''submitted'') or new.status is null then','if new.status is distinct from ''draft'' then');
 definition:=replace(definition,'if new.status=''submitted'' then','if new.status=''submitted'' then
 if not exists(select 1 from public.loan_documents where loan_id=new.id) then raise exception ''Attach the bank application package before submission'' using errcode=''23514''; end if;');
 definition:=replace(definition,'if old.status=''verification'' and new.status=''kkg_review'' and not exists','if old.status=''kkg_review'' and new.status=''verification'' and not exists(select 1 from public.committee_agenda_items i join public.committee_meetings m on m.id=i.meeting_id where i.loan_id=new.id and m.status in (''scheduled'',''in_progress'')) then raise exception ''A frozen protocol cannot be returned for verification'' using errcode=''23514''; end if;
 if old.status=''verification'' and new.status=''kkg_review'' and not exists');
 definition:=replace(definition,'new.current_step:=case new.status','if tg_op=''UPDATE'' and old.status=''verification'' and new.status=''kkg_review'' then
 delete from public.committee_votes v using public.committee_agenda_items i,public.committee_meetings m where v.agenda_item_id=i.id and i.loan_id=new.id and m.id=i.meeting_id and m.status in (''scheduled'',''in_progress'');
 end if;
 new.current_step:=case new.status');
 execute definition;
end $$;
create function cgf_private.guard_pipeline_decision_evidence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and old.status in ('assessment','risk_review') then
   if old.status='assessment' and new.status in ('risk_review','kkg_scheduled') and not exists(select 1 from public.assessment_notes n where n.loan_id=old.id and n.status='submitted' and n.created_at>=coalesce((select max(h.created_at) from public.loan_application_history h where h.loan_id=old.id and h.new_status='assessment'),'-infinity'::timestamptz)) then raise exception 'A fresh assessment is required after clarification' using errcode='23514'; end if;
   if old.status='risk_review' and new.status='kkg_scheduled' and not exists(select 1 from public.risk_reviews n where n.loan_id=old.id and n.status='submitted' and n.created_at>=coalesce((select max(h.created_at) from public.loan_application_history h where h.loan_id=old.id and h.new_status='risk_review'),'-infinity'::timestamptz)) then raise exception 'A fresh risk opinion is required' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger cgf_pipeline_fresh_evidence before update on public.loan_applications for each row execute function cgf_private.guard_pipeline_decision_evidence();
revoke all on function cgf_private.guard_pipeline_decision_evidence() from public,anon,authenticated;
