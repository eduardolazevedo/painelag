
-- 1. Audit log table (immutable, append-only)
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  user_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No UPDATE or DELETE allowed via RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.audit_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert audit log"
  ON public.audit_log FOR INSERT
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_audit_log_entity ON public.audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_created ON public.audit_log (created_at DESC);

-- 2. Survey quotas table
CREATE TABLE public.survey_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  dimension text NOT NULL,
  category text NOT NULL,
  target_count integer NOT NULL,
  current_count integer NOT NULL DEFAULT 0,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(survey_id, dimension, category)
);

ALTER TABLE public.survey_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors can manage quotas"
  ON public.survey_quotas FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'editor'));

CREATE POLICY "Authenticated can view quotas"
  ON public.survey_quotas FOR SELECT
  USING (true);

-- 3. Audit trigger function
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, entity_type, entity_id, user_id, metadata)
    VALUES (
      TG_OP,
      TG_TABLE_NAME,
      NEW.id,
      COALESCE(auth.uid(), NEW.user_id),
      jsonb_build_object('new', to_jsonb(NEW))
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (event_type, entity_type, entity_id, user_id, metadata)
    VALUES (
      TG_OP,
      TG_TABLE_NAME,
      NEW.id,
      auth.uid(),
      jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (event_type, entity_type, entity_id, user_id, metadata)
    VALUES (
      TG_OP,
      TG_TABLE_NAME,
      OLD.id,
      auth.uid(),
      jsonb_build_object('old', to_jsonb(OLD))
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach audit triggers to key tables
CREATE TRIGGER audit_surveys
  AFTER INSERT OR UPDATE OR DELETE ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER audit_responses
  AFTER INSERT OR UPDATE ON public.responses
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER audit_survey_quotas
  AFTER INSERT OR UPDATE ON public.survey_quotas
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- 4. Quota check and update function
CREATE OR REPLACE FUNCTION public.check_and_update_quota(
  p_survey_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile record;
  v_quota record;
  v_age_group text;
  v_blocked boolean := false;
  v_blocked_dims text[] := '{}';
BEGIN
  -- Get user profile
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Profile not found');
  END IF;

  -- Calculate age group
  IF v_profile.birth_year IS NOT NULL THEN
    v_age_group := CASE
      WHEN 2026 - v_profile.birth_year < 25 THEN '18-24'
      WHEN 2026 - v_profile.birth_year < 35 THEN '25-34'
      WHEN 2026 - v_profile.birth_year < 45 THEN '35-44'
      WHEN 2026 - v_profile.birth_year < 55 THEN '45-54'
      WHEN 2026 - v_profile.birth_year < 65 THEN '55-64'
      ELSE '65+'
    END;
  END IF;

  -- Check each quota for this survey
  FOR v_quota IN
    SELECT * FROM public.survey_quotas
    WHERE survey_id = p_survey_id AND is_closed = false
  LOOP
    IF (v_quota.dimension = 'gender' AND v_profile.gender = v_quota.category)
       OR (v_quota.dimension = 'age_group' AND v_age_group = v_quota.category)
       OR (v_quota.dimension = 'education_level' AND v_profile.education_level = v_quota.category)
       OR (v_quota.dimension = 'income_bracket' AND v_profile.income_bracket = v_quota.category)
    THEN
      IF v_quota.current_count >= v_quota.target_count THEN
        v_blocked := true;
        v_blocked_dims := array_append(v_blocked_dims, v_quota.dimension || ':' || v_quota.category);
      END IF;
    END IF;
  END LOOP;

  IF v_blocked THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Quota exceeded', 'blocked_cells', v_blocked_dims);
  END IF;

  -- Increment matching quotas
  UPDATE public.survey_quotas sq
  SET current_count = current_count + 1,
      is_closed = (current_count + 1 >= target_count),
      updated_at = now()
  WHERE sq.survey_id = p_survey_id
    AND (
      (sq.dimension = 'gender' AND v_profile.gender = sq.category)
      OR (sq.dimension = 'age_group' AND v_age_group = sq.category)
      OR (sq.dimension = 'education_level' AND v_profile.education_level = sq.category)
      OR (sq.dimension = 'income_bracket' AND v_profile.income_bracket = sq.category)
    );

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- 5. Cross-tabulation function with chi-square
CREATE OR REPLACE FUNCTION public.cross_tabulate(
  p_survey_id uuid,
  p_question_id uuid,
  p_dimension text,
  p_weights jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb := '{}';
  v_categories text[];
  v_options jsonb := '[]';
  v_crosstab jsonb := '{}';
  v_chi2 numeric := 0;
  v_df integer := 0;
  v_n numeric := 0;
  v_expected numeric;
  v_observed numeric;
  v_row_totals jsonb := '{}';
  v_col_totals jsonb := '{}';
  v_total numeric := 0;
  v_cat text;
  v_opt record;
  v_resp record;
  v_w numeric;
  v_age_group text;
  v_match_val text;
BEGIN
  -- Get distinct categories for the dimension
  SELECT array_agg(DISTINCT category) INTO v_categories
  FROM public.demographic_weights WHERE dimension = p_dimension;

  -- Get question options
  SELECT jsonb_agg(jsonb_build_object('id', id, 'text', option_text) ORDER BY display_order)
  INTO v_options
  FROM public.question_options WHERE question_id = p_question_id;

  -- Build crosstab: { category: { option_id: weighted_count } }
  FOR v_resp IN
    SELECT ra.selected_option_id, ra.response_id, r.user_id,
           p.gender, p.birth_year, p.education_level, p.income_bracket
    FROM public.response_answers ra
    JOIN public.responses r ON r.id = ra.response_id
    JOIN public.profiles p ON p.user_id = r.user_id
    WHERE ra.question_id = p_question_id
      AND r.survey_id = p_survey_id
      AND r.completed_at IS NOT NULL
      AND r.is_valid = true
      AND ra.selected_option_id IS NOT NULL
  LOOP
    v_w := COALESCE((p_weights->>v_resp.response_id::text)::numeric, 1);

    -- Determine respondent's category for the dimension
    IF p_dimension = 'gender' THEN
      v_match_val := v_resp.gender;
    ELSIF p_dimension = 'education_level' THEN
      v_match_val := v_resp.education_level;
    ELSIF p_dimension = 'income_bracket' THEN
      v_match_val := v_resp.income_bracket;
    ELSIF p_dimension = 'age_group' THEN
      IF v_resp.birth_year IS NOT NULL THEN
        v_match_val := CASE
          WHEN 2026 - v_resp.birth_year < 25 THEN '18-24'
          WHEN 2026 - v_resp.birth_year < 35 THEN '25-34'
          WHEN 2026 - v_resp.birth_year < 45 THEN '35-44'
          WHEN 2026 - v_resp.birth_year < 55 THEN '45-54'
          WHEN 2026 - v_resp.birth_year < 65 THEN '55-64'
          ELSE '65+'
        END;
      ELSE
        v_match_val := NULL;
      END IF;
    END IF;

    IF v_match_val IS NOT NULL THEN
      -- Increment crosstab[category][option_id]
      IF NOT v_crosstab ? v_match_val THEN
        v_crosstab := v_crosstab || jsonb_build_object(v_match_val, '{}');
      END IF;
      v_observed := COALESCE((v_crosstab->v_match_val->>v_resp.selected_option_id::text)::numeric, 0) + v_w;
      v_crosstab := jsonb_set(v_crosstab, ARRAY[v_match_val, v_resp.selected_option_id::text], to_jsonb(v_observed));
      v_total := v_total + v_w;
    END IF;
  END LOOP;

  -- Calculate row/col totals for chi-square
  IF v_categories IS NOT NULL AND v_total > 0 THEN
    FOREACH v_cat IN ARRAY v_categories
    LOOP
      v_row_totals := v_row_totals || jsonb_build_object(v_cat, (
        SELECT COALESCE(sum((v_crosstab->v_cat->>key)::numeric), 0) FROM jsonb_object_keys(COALESCE(v_crosstab->v_cat, '{}')) AS key
      ));
    END LOOP;

    FOR v_opt IN SELECT id::text as oid FROM question_options WHERE question_id = p_question_id
    LOOP
      v_col_totals := v_col_totals || jsonb_build_object(v_opt.oid, (
        SELECT COALESCE(sum((v_crosstab->cat->>v_opt.oid)::numeric), 0)
        FROM unnest(v_categories) AS cat
        WHERE v_crosstab->cat ? v_opt.oid
      ));
    END LOOP;

    -- Chi-square calculation
    v_df := 0;
    FOREACH v_cat IN ARRAY v_categories
    LOOP
      FOR v_opt IN SELECT id::text as oid FROM question_options WHERE question_id = p_question_id
      LOOP
        v_observed := COALESCE((v_crosstab->v_cat->>v_opt.oid)::numeric, 0);
        v_expected := COALESCE((v_row_totals->>v_cat)::numeric, 0) * COALESCE((v_col_totals->>v_opt.oid)::numeric, 0) / NULLIF(v_total, 0);
        IF v_expected > 0 THEN
          v_chi2 := v_chi2 + ((v_observed - v_expected) ^ 2) / v_expected;
          v_df := v_df + 1;
        END IF;
      END LOOP;
    END LOOP;
    -- Adjust df: (rows - 1) * (cols - 1)
    v_df := GREATEST((array_length(v_categories, 1) - 1) * (
      (SELECT count(*) FROM question_options WHERE question_id = p_question_id)::int - 1
    ), 0);
  END IF;

  RETURN jsonb_build_object(
    'crosstab', v_crosstab,
    'options', v_options,
    'categories', to_jsonb(v_categories),
    'row_totals', v_row_totals,
    'col_totals', v_col_totals,
    'total', v_total,
    'chi_square', round(v_chi2, 4),
    'degrees_of_freedom', v_df,
    'significant_005', v_chi2 > CASE v_df
      WHEN 1 THEN 3.84 WHEN 2 THEN 5.99 WHEN 3 THEN 7.81 WHEN 4 THEN 9.49
      WHEN 5 THEN 11.07 WHEN 6 THEN 12.59 WHEN 8 THEN 15.51 WHEN 10 THEN 18.31
      WHEN 12 THEN 21.03 WHEN 15 THEN 25.00 WHEN 20 THEN 31.41
      ELSE v_df * 1.5
    END
  );
END;
$$;
