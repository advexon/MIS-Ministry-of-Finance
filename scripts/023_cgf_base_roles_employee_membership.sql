insert into public.roles (code,name_en,name_ru,name_tj,tier,description,is_active) values
('deputy_director','Deputy Director','Заместитель директора','Муовини директор',3,'Reviews and confirms files before Director signature',true),
('accountant','Accountant','Бухгалтер','Муҳосиб',4,'Fees, reconciliation and tariff preparation',true),
('reporting_officer','Monitoring and Reporting','Мониторинг и отчетность','Мониторинг ва ҳисобот',4,'Portfolio monitoring and reporting',true),
('legal_officer','Legal Officer','Юрист','Ҳуқуқшинос',4,'Access only to explicitly invited cases',true),
('business_development','Business Development','Развитие бизнеса','Рушди тиҷорат',4,'Product development; business features require administrator enablement',true)
on conflict (code) do nothing;
update public.roles set name_en='Director',name_ru='Директор',name_tj='Директор',description='Director decision and guarantee signature' where code='fkg_management';
update public.roles set name_en='Credit Analyst',name_ru='Аналитик',name_tj='Таҳлилгар' where code='prsf_analyst';
update public.profiles p set role_id=(select id from public.roles where code='prsf_analyst'), department=coalesce(p.department,'operations'), is_loan_committee_member=p.is_loan_committee_member or r.code in ('kkg_member','kkg_secretary'),is_committee_secretary=p.is_committee_secretary or r.code='kkg_secretary',is_department_head=p.is_department_head or r.code='uko_officer' from public.roles r where p.role_id=r.id and r.code in ('kkg_member','kkg_secretary','uko_officer');
update public.roles set is_active=false,description='Retired: use a base role and employee flags' where code in ('kkg_member','kkg_secretary','uko_officer');
insert into public.role_permissions(role_id,resource,can_view,can_create,can_update,can_delete,can_approve)
select r.id,v.resource,true,v.can_create,v.can_update,false,false from public.roles r join (values
('deputy_director','loans',false,true),('deputy_director','claims',false,false),('deputy_director','reports',false,false),
('accountant','fees',true,true),('accountant','reports',true,false),('accountant','banks',false,false),
('reporting_officer','reports',true,true),('reporting_officer','loans',false,false),
('legal_officer','loans',false,false),('legal_officer','claims',false,false),
('business_development','reports',false,false)
) as v(code,resource,can_create,can_update) on v.code=r.code on conflict(role_id,resource) do nothing;
create or replace function public.is_prsf_staff() returns boolean language sql stable security definer set search_path='' as $$ select coalesce(public.current_user_role_code() in ('super_admin','prsf_admin','prsf_analyst','auditor','credit_risk_officer','compliance_officer','fkg_management','deputy_director','accountant','reporting_officer','business_development'),false) $$;
create or replace function public.is_kkg_secretary() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_active and r.code in ('prsf_analyst','credit_risk_officer','compliance_officer') and p.is_committee_secretary) $$;
create or replace function public.cgf_guard_assignable_role() returns trigger language plpgsql set search_path='' as $$ begin if new.role_id is not null and (tg_op='INSERT' or new.role_id is distinct from old.role_id) and not exists(select 1 from public.roles where id=new.role_id and is_active and code not in ('kkg_member','kkg_secretary','uko_officer')) then raise exception 'Only an active base role may be assigned' using errcode='23514'; end if; return new; end $$;
create trigger cgf_guard_assignable_role before insert or update of role_id on public.profiles for each row execute function public.cgf_guard_assignable_role();
revoke all on function public.cgf_guard_assignable_role() from public,anon,authenticated;
revoke all on function public.is_prsf_staff(),public.is_kkg_secretary() from public,anon;
grant execute on function public.is_prsf_staff(),public.is_kkg_secretary() to authenticated;
