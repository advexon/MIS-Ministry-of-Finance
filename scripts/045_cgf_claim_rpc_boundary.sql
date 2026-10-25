BEGIN;
DO $rpc_guard$
DECLARE
  definition text := pg_get_functiondef('public.cgf_transition_loan(uuid,text,text,text,jsonb,jsonb)'::regprocedure);
  original text := 'if p_to in (''guarantee_issued'',''kkg_protocol'')';
BEGIN
  IF position(original IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected generic workflow definition; review before changing claim guards';
  END IF;
  EXECUTE replace(definition, original,
    'if p_to in (''guarantee_issued'',''kkg_protocol'',''claim_pending'',''claim_paid'',''claim_rejected'')');
END;
$rpc_guard$;
COMMIT;
