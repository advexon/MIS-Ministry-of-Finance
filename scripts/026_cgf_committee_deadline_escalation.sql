create extension if not exists pg_cron with schema pg_catalog;
create function cgf_private.escalate_overdue_committees() returns integer language plpgsql security definer set search_path='' as $$
declare m record; n int:=0;
begin
 for m in select cm.id,cm.meeting_no from public.committee_meetings cm
 where cm.status not in ('closed','protocol_issued','cancelled') and cm.due_at<now() and cm.escalated_at is null
 and exists(select 1 from public.committee_meeting_members mm cross join public.committee_agenda_items ai where mm.meeting_id=cm.id and ai.meeting_id=cm.id and not exists(select 1 from public.committee_votes v where v.agenda_item_id=ai.id and v.member_id=mm.member_id))
 and exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='fkg_management')
 for update skip locked loop
   insert into public.notifications(user_id,title,message,type,link)
   select p.id,'Committee voting deadline exceeded','Sitting '||coalesce(m.meeting_no,m.id::text)||' has missing votes after one working day.','warning','/dashboard/committee'
   from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='fkg_management';
   update public.committee_meetings set escalated_at=now() where id=m.id;
   insert into public.audit_trail(table_name,record_id,action,new_data) values('committee_meetings',m.id,'COMMITTEE_ESCALATION',jsonb_build_object('reason','Missing votes after one working day'));
   n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function cgf_private.escalate_overdue_committees() from public,anon,authenticated;
select cron.schedule('cgf-committee-voting-escalation','*/5 * * * *','select cgf_private.escalate_overdue_committees()');
