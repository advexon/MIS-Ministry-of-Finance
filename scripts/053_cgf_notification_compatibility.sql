begin;
create function cgf_private.notification_enabled(p_key text) returns boolean
language plpgsql stable security definer set search_path='' as $$ declare setting_value text; begin
 select value into setting_value from public.system_settings where key=p_key;
 if setting_value is null then return true; end if;
 if setting_value in ('true','false') then return setting_value::boolean; end if;
 return coalesce((setting_value::jsonb->>'enabled')::boolean,true);
 exception when invalid_text_representation then return true;
end $$;
revoke all on function cgf_private.notification_enabled(text) from public,anon,authenticated;
create or replace function cgf_private.filter_operational_notification() returns trigger
language plpgsql security definer set search_path='' as $$ declare setting_key text; begin
 setting_key:=case when new.title='Application assigned' then 'notify_loan_submitted' when new.title in ('Guarantee application rejected','Application status updated','Signed guarantee letter available') then 'notify_loan_reviewed' when new.title='Guarantee claim submitted' then 'notify_claim_submitted' end;
 if setting_key is not null and not cgf_private.notification_enabled(setting_key) then return null; end if;
 return new;
end $$;
commit;
