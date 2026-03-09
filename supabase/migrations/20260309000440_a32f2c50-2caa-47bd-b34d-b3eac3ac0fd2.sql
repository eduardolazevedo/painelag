-- Tighten audit log INSERT policy to prevent forged entries
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'audit_log'
  ) THEN
    DROP POLICY IF EXISTS "Authenticated can insert audit log" ON public.audit_log;

    CREATE POLICY "Authenticated can insert audit log"
    ON public.audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;