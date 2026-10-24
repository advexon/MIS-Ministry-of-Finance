create or replace function cgf_private.guard_committee_immutable() returns trigger language plpgsql set search_path='' as $$
declare mid uuid; s text;
begin
 if tg_table_name='committee_meetings' then
   if old.status in ('closed','protocol_issued','cancelled') then raise exception 'Finalized sittings are immutable; convene a new sitting' using errcode='23514'; end if;
 else
   if tg_table_name='committee_votes' then select meeting_id into mid from public.committee_agenda_items where id=case when tg_op='INSERT' then new.agenda_item_id else old.agenda_item_id end;
   else mid:=case when tg_op='INSERT' then new.meeting_id else old.meeting_id end; end if;
   select status into s from public.committee_meetings where id=mid for update;
   if s in ('closed','protocol_issued','cancelled') then raise exception 'Finalized sittings are immutable; convene a new sitting' using errcode='23514'; end if;
   if s='signing' and not (tg_table_name='committee_meeting_members' and tg_op='UPDATE' and (to_jsonb(new)-'signed_at')=(to_jsonb(old)-'signed_at') and (to_jsonb(old)->>'signed_at') is null and (to_jsonb(new)->>'signed_at') is not null) then raise exception 'The protocol is frozen for signatures' using errcode='23514'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
