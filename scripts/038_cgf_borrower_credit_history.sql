create or replace function public.cgf_borrower_credit_history(p_borrower_id uuid, p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_prsf_staff(), false) then
    raise exception 'Fund staff access required' using errcode = '42501';
  end if;
  if p_borrower_id is null or p_limit is null or p_limit < 1 or p_limit > 50 or p_offset is null or p_offset < 0 then
    raise exception 'Invalid history pagination' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'total', (select count(*) from public.loan_applications l where l.borrower_id = p_borrower_id),
    'items', coalesce((select jsonb_agg(to_jsonb(entry) order by entry.created_at desc nulls last, entry.id desc) from (
      select l.id, l.loan_request_id, l.loan_number, l.bank_id, b.name_en as bank_name,
        l.status, l.currency, l.approved_amount, l.created_at, l.guarantee_issued_date,
        l.settlement_date, l.defaulted_date
      from public.loan_applications l
      left join public.banks b on b.id = l.bank_id
      where l.borrower_id = p_borrower_id
      order by l.created_at desc nulls last, l.id desc
      limit p_limit offset p_offset
    ) entry), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.cgf_borrower_credit_history(uuid, integer, integer) from public, anon, service_role;
grant execute on function public.cgf_borrower_credit_history(uuid, integer, integer) to authenticated;
