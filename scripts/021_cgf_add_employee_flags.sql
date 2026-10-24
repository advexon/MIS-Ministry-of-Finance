alter table public.profiles
  add column specialist_level text check (specialist_level in ('specialist','chief_specialist')),
  add column department text,
  add column is_department_head boolean not null default false,
  add column is_loan_committee_member boolean not null default false,
  add column is_claims_committee_member boolean not null default false,
  add column is_committee_secretary boolean not null default false,
  add column product_tags text[] not null default '{}';

update public.profiles p set
  is_loan_committee_member = r.code in ('kkg_member','kkg_secretary'),
  is_committee_secretary = r.code = 'kkg_secretary',
  is_department_head = r.code = 'uko_officer',
  department = 'operations'
from public.roles r
where p.role_id=r.id and r.code in ('kkg_member','kkg_secretary','uko_officer','prsf_analyst');
