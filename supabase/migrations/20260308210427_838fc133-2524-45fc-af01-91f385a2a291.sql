
-- Fix: audit_log inserts only via authenticated or service role
DROP POLICY "System can insert audit log" ON public.audit_log;
CREATE POLICY "Authenticated can insert audit log"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Also fix: survey_quotas SELECT should require auth
DROP POLICY "Authenticated can view quotas" ON public.survey_quotas;
CREATE POLICY "Authenticated can view quotas"
  ON public.survey_quotas FOR SELECT
  TO authenticated
  USING (true);
