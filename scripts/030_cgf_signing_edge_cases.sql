do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.cgf_confirm_deputy(uuid,text)'::regprocedure);
 if position('snapshot#>>''{compliance,outcome}''=''not_cleared''' in definition)=0 then raise exception 'Unexpected deputy function definition'; end if;
 definition:=replace(definition,'snapshot#>>''{compliance,outcome}''=''not_cleared''','coalesce(snapshot#>>''{compliance,outcome}'','''') not in (''cleared'',''cleared_with_conditions'')');
 execute definition;
 definition:=pg_get_functiondef('public.cgf_issue_guarantee(uuid)'::regprocedure);
 if position('bank_code text; expiry timestamptz;' in definition)=0 or position('lpad(nextval(''public.cgf_guarantee_serial'')::text,6,''0'')' in definition)=0 then raise exception 'Unexpected issuance function definition'; end if;
 definition:=replace(definition,'bank_code text; expiry timestamptz;','bank_code text; serialtext text; expiry timestamptz;');
 definition:=replace(definition,'number:=''GF-''','serialtext:=nextval(''public.cgf_guarantee_serial'')::text; number:=''GF-''');
 definition:=replace(definition,'lpad(nextval(''public.cgf_guarantee_serial'')::text,6,''0'')','lpad(serialtext,greatest(6,length(serialtext)),''0'')');
 definition:=replace(definition,'select code into bank_code from public.banks where id=l.bank_id;',
 'if coalesce(l.guarantee_amount,0)<=0 or coalesce(l.approved_amount,0)<=0 or l.guarantee_amount>l.approved_amount or coalesce(l.guarantee_coverage,0)<=0 or l.guarantee_coverage>100 then raise exception ''Valid positive loan and guarantee terms are required'' using errcode=''23514''; end if;
 if (decision.approved_amount is not null and decision.approved_amount<>l.guarantee_amount) or (decision.approved_coverage is not null and decision.approved_coverage<>l.guarantee_coverage) then raise exception ''The recorded approval and reviewed guarantee terms differ; obtain a new deputy review and Director decision'' using errcode=''23514''; end if;
 select code into bank_code from public.banks where id=l.bank_id;');
 execute definition;
 definition:=pg_get_functiondef('public.cgf_committee_action(text,uuid,jsonb)'::regprocedure);
 if position('rc in (''super_admin'',''prsf_admin'',''auditor'',''bank_admin'',''bank_officer'',''legal_officer'',''accountant'',''reporting_officer'',''business_development'',''deputy_director'')' in definition)=0 then raise exception 'Unexpected committee function definition'; end if;
 definition:=replace(definition,'rc in (''super_admin'',''prsf_admin'',''auditor'',''bank_admin'',''bank_officer'',''legal_officer'',''accountant'',''reporting_officer'',''business_development'',''deputy_director'')','rc not in (''prsf_analyst'',''credit_risk_officer'',''compliance_officer'',''fkg_management'')');
 execute definition;
end $$;
