begin;

revoke truncate, references, trigger, maintain on all tables in schema public
  from public, anon, authenticated;
revoke all on public.loan_applications from public, anon;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

commit;
