
-- 1. Add role guard to calculate_raking_weights
CREATE OR REPLACE FUNCTION public.calculate_raking_weights(p_survey_id uuid, p_max_iterations integer DEFAULT 50, p_convergence_threshold numeric DEFAULT 0.001, p_max_weight numeric DEFAULT 5.0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_respondent record;
  v_dimension record;
  v_weights jsonb := '{}';
  v_iteration integer := 0;
  v_max_change numeric := 1;
  v_target_prop numeric;
  v_current_prop numeric;
  v_adjustment numeric;
  v_total_weight numeric;
  v_respondent_count integer;
  v_design_effect numeric;
  v_effective_n numeric;
  v_sum_w numeric;
  v_sum_w2 numeric;
BEGIN
  -- Role guard: only admin, analyst, or editor
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'analyst') OR has_role(auth.uid(), 'editor')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR v_respondent IN
    SELECT r.id as response_id, r.user_id,
           p.gender, p.birth_year, p.education_level, p.income_bracket, p.municipality
    FROM public.responses r
    JOIN public.profiles p ON p.user_id = r.user_id
    WHERE r.survey_id = p_survey_id
      AND r.completed_at IS NOT NULL
      AND r.is_valid = true
  LOOP
    v_weights := v_weights || jsonb_build_object(v_respondent.response_id::text, 1.0);
  END LOOP;

  SELECT count(*) INTO v_respondent_count FROM jsonb_object_keys(v_weights);

  IF v_respondent_count < 10 THEN
    RETURN jsonb_build_object(
      'error', 'Insufficient valid responses for weighting',
      'respondent_count', v_respondent_count,
      'weights', v_weights
    );
  END IF;

  WHILE v_iteration < p_max_iterations AND v_max_change > p_convergence_threshold LOOP
    v_max_change := 0;
    v_iteration := v_iteration + 1;

    FOR v_dimension IN
      SELECT DISTINCT dimension, category, census_proportion
      FROM public.demographic_weights
      WHERE census_proportion > 0
    LOOP
      v_total_weight := 0;
      v_current_prop := 0;

      FOR v_respondent IN
        SELECT r.id as response_id, p.gender, p.education_level, p.income_bracket,
               CASE
                 WHEN p.birth_year IS NOT NULL THEN
                   CASE
                     WHEN 2026 - p.birth_year < 25 THEN '18-24'
                     WHEN 2026 - p.birth_year < 35 THEN '25-34'
                     WHEN 2026 - p.birth_year < 45 THEN '35-44'
                     WHEN 2026 - p.birth_year < 55 THEN '45-54'
                     WHEN 2026 - p.birth_year < 65 THEN '55-64'
                     ELSE '65+'
                   END
                 ELSE NULL
               END as age_group
        FROM public.responses r
        JOIN public.profiles p ON p.user_id = r.user_id
        WHERE r.survey_id = p_survey_id
          AND r.completed_at IS NOT NULL
          AND r.is_valid = true
      LOOP
        v_total_weight := v_total_weight + COALESCE((v_weights->>v_respondent.response_id::text)::numeric, 1);

        IF (v_dimension.dimension = 'gender' AND v_respondent.gender = v_dimension.category)
           OR (v_dimension.dimension = 'age_group' AND
               CASE WHEN v_respondent.age_group IS NOT NULL THEN v_respondent.age_group = v_dimension.category ELSE false END)
           OR (v_dimension.dimension = 'education_level' AND v_respondent.education_level = v_dimension.category)
           OR (v_dimension.dimension = 'income_bracket' AND v_respondent.income_bracket = v_dimension.category)
        THEN
          v_current_prop := v_current_prop + COALESCE((v_weights->>v_respondent.response_id::text)::numeric, 1);
        END IF;
      END LOOP;

      IF v_total_weight > 0 AND v_current_prop > 0 THEN
        v_current_prop := v_current_prop / v_total_weight;
        v_target_prop := v_dimension.census_proportion;
        v_adjustment := v_target_prop / v_current_prop;

        IF abs(v_adjustment - 1) > v_max_change THEN
          v_max_change := abs(v_adjustment - 1);
        END IF;

        FOR v_respondent IN
          SELECT r.id as response_id, p.gender, p.education_level, p.income_bracket,
                 CASE
                   WHEN p.birth_year IS NOT NULL THEN
                     CASE
                       WHEN 2026 - p.birth_year < 25 THEN '18-24'
                       WHEN 2026 - p.birth_year < 35 THEN '25-34'
                       WHEN 2026 - p.birth_year < 45 THEN '35-44'
                       WHEN 2026 - p.birth_year < 55 THEN '45-54'
                       WHEN 2026 - p.birth_year < 65 THEN '55-64'
                       ELSE '65+'
                     END
                   ELSE NULL
                 END as age_group
          FROM public.responses r
          JOIN public.profiles p ON p.user_id = r.user_id
          WHERE r.survey_id = p_survey_id
            AND r.completed_at IS NOT NULL
            AND r.is_valid = true
        LOOP
          IF (v_dimension.dimension = 'gender' AND v_respondent.gender = v_dimension.category)
             OR (v_dimension.dimension = 'age_group' AND v_respondent.age_group IS NOT NULL AND v_respondent.age_group = v_dimension.category)
             OR (v_dimension.dimension = 'education_level' AND v_respondent.education_level = v_dimension.category)
             OR (v_dimension.dimension = 'income_bracket' AND v_respondent.income_bracket = v_dimension.category)
          THEN
            v_weights := jsonb_set(
              v_weights,
              ARRAY[v_respondent.response_id::text],
              to_jsonb(LEAST(
                (COALESCE((v_weights->>v_respondent.response_id::text)::numeric, 1) * v_adjustment),
                p_max_weight
              ))
            );
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  FOR v_respondent IN SELECT * FROM jsonb_each_text(v_weights)
  LOOP
    IF v_respondent.value::numeric > p_max_weight THEN
      v_weights := jsonb_set(v_weights, ARRAY[v_respondent.key], to_jsonb(p_max_weight));
    ELSIF v_respondent.value::numeric < (1.0 / p_max_weight) THEN
      v_weights := jsonb_set(v_weights, ARRAY[v_respondent.key], to_jsonb(1.0 / p_max_weight));
    END IF;
  END LOOP;

  v_sum_w := 0;
  v_sum_w2 := 0;
  FOR v_respondent IN SELECT * FROM jsonb_each_text(v_weights)
  LOOP
    v_sum_w := v_sum_w + v_respondent.value::numeric;
    v_sum_w2 := v_sum_w2 + (v_respondent.value::numeric ^ 2);
  END LOOP;

  v_design_effect := CASE WHEN v_sum_w > 0 THEN v_respondent_count * v_sum_w2 / (v_sum_w ^ 2) ELSE 1 END;
  v_effective_n := CASE WHEN v_design_effect > 0 THEN v_respondent_count / v_design_effect ELSE v_respondent_count END;

  RETURN jsonb_build_object(
    'weights', v_weights,
    'iterations', v_iteration,
    'converged', v_max_change <= p_convergence_threshold,
    'max_change', v_max_change,
    'respondent_count', v_respondent_count,
    'design_effect', round(v_design_effect::numeric, 4),
    'effective_n', round(v_effective_n::numeric, 1),
    'margin_of_error_95', round((1.96 / sqrt(v_effective_n)) * 100, 2)
  );
END;
$function$;

-- 2. Add role guard to cross_tabulate
CREATE OR REPLACE FUNCTION public.cross_tabulate(p_survey_id uuid, p_question_id uuid, p_dimension text, p_weights jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Role guard: only admin, analyst, or editor
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'analyst') OR has_role(auth.uid(), 'editor')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT array_agg(DISTINCT category) INTO v_categories
  FROM public.demographic_weights WHERE dimension = p_dimension;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'text', option_text) ORDER BY display_order)
  INTO v_options
  FROM public.question_options WHERE question_id = p_question_id;

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
      IF NOT v_crosstab ? v_match_val THEN
        v_crosstab := v_crosstab || jsonb_build_object(v_match_val, '{}');
      END IF;
      v_observed := COALESCE((v_crosstab->v_match_val->>v_resp.selected_option_id::text)::numeric, 0) + v_w;
      v_crosstab := jsonb_set(v_crosstab, ARRAY[v_match_val, v_resp.selected_option_id::text], to_jsonb(v_observed));
      v_total := v_total + v_w;
    END IF;
  END LOOP;

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
$function$;

-- 3. Fix survey_suggestions SELECT: only owner + admin/editor can see rows (hides user_id from other panelists)
DROP POLICY IF EXISTS "Authenticated can view suggestions" ON public.survey_suggestions;

CREATE POLICY "Users see own or admins see all suggestions"
  ON public.survey_suggestions FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'editor')
  );

-- 4. Drop any leftover permissive audit_log INSERT policy
DROP POLICY IF EXISTS "System can insert audit log" ON public.audit_log;
