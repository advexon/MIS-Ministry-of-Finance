begin;
create function public.cgf_search_applications(p_search text default '') returns setof public.loan_applications language sql stable security invoker set search_path='' as $$
 select l.* from public.loan_applications l where length(coalesce(p_search,''))<=200 and (btrim(coalesce(p_search,''))='' or position(lower(btrim(p_search)) in lower(coalesce(l.loan_number,'')))>0 or position(lower(btrim(p_search)) in lower(coalesce(l.loan_request_id,'')))>0 or position(lower(btrim(p_search)) in lower(coalesce(l.intake_data->>'clientName','')))>0 or position(lower(btrim(p_search)) in lower(coalesce(l.intake_data->>'clientTin','')))>0 or exists(select 1 from public.borrowers b where b.id=l.borrower_id and (position(lower(btrim(p_search)) in lower(b.name))>0 or position(lower(btrim(p_search)) in lower(b.tin_number))>0)))
$$;
revoke all on function public.cgf_search_applications(text) from public,anon;
grant execute on function public.cgf_search_applications(text) to authenticated;
do $$ declare definition text; begin
 select pg_get_functiondef('public.cgf_save_application(uuid,jsonb,bigint,text,uuid,text)'::regprocedure) into definition;
 definition:=replace(definition,$old$ if existing and l.created_by=actor and l.intake_data=p_form and p_expected_revision is null then$old$,$new$ if existing and l.intake_data=p_form and ((l.created_by=actor and p_expected_revision is null) or (p_expected_revision is not null and l.intake_revision=p_expected_revision+1 and l.status=p_expected_status and exists(select 1 from public.audit_trail a where a.table_name='loan_applications' and a.record_id=l.id and a.changed_by=actor and a.new_data->'application'->>'intake_revision'=l.intake_revision::text and a.new_data->'application'->'intake_data'=p_form))) then$new$);
 execute definition;
 select pg_get_functiondef('cgf_private.guard_application_boundary()'::regprocedure) into definition;
 definition:=replace(definition,$old$ else
  if new.branch_id$old$,$new$ else
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at or new.loan_request_id is distinct from old.loan_request_id or new.loan_number is distinct from old.loan_number then raise exception 'Application identity and attribution are immutable' using errcode='42501'; end if;
  if new.branch_id$new$);
 execute definition;
end $$;
commit;
