begin;
insert into public.column_configurations(entity_type, column_key, display_name_en, is_required)
values ('form:loan_application', 'branchId', 'Branch', false)
on conflict (entity_type, column_key) do update
set is_required = false, updated_at = now();
commit;
