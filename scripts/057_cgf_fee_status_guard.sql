begin;
do $$
declare definition text;
begin
  select pg_get_functiondef('public.cgf_create_fee(uuid,uuid,text,date,date,date,uuid,text,bigint)'::regprocedure) into definition;
  if position('l.status not in (' in definition)=0 then raise exception 'Expected fee eligibility guard not found';end if;
  definition:=replace(definition,'l.status not in (','coalesce(l.status,'''') not in (');
  execute definition;
end $$;
notify pgrst,'reload schema';
commit;
