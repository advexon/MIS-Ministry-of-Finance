begin;
alter table public.loan_applications add column authority_reason text check(authority_reason is null or length(btrim(authority_reason)) between 3 and 2000);
do $$ declare definition text; begin
 select pg_get_functiondef('cgf_private.guard_pipeline()'::regprocedure) into definition;
 definition:=replace(definition,'if tg_op=''INSERT'' then','if tg_op=''INSERT'' then if public.cgf_is_super_admin() then perform cgf_private.require_admin_reason(new.authority_reason); perform set_config(''cgf.pipeline_reason'',new.authority_reason,true); end if;');
 execute definition;
 select pg_get_functiondef('cgf_private.claim_submission_events()'::regprocedure) into definition;
 definition:=replace(definition,'SELECT * INTO application FROM public.loan_applications','perform cgf_private.require_admin_reason(new.reason); SELECT * INTO application FROM public.loan_applications');
 execute definition;
end $$;
commit;
