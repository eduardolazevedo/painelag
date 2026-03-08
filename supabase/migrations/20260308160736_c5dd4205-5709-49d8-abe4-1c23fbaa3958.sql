
-- 1. Add quality control columns to responses
ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS quality_score numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quality_flags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_valid boolean DEFAULT true;

-- 2. Add minimum_duration_seconds to surveys for speeder detection
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS minimum_duration_seconds integer DEFAULT NULL;

-- 3. Trigger to freeze questions when survey goes active
CREATE OR REPLACE FUNCTION public.prevent_active_survey_question_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  survey_status survey_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO survey_status FROM public.surveys WHERE id = OLD.survey_id;
  ELSE
    SELECT status INTO survey_status FROM public.surveys WHERE id = NEW.survey_id;
  END IF;

  IF survey_status IN ('active', 'closed') THEN
    RAISE EXCEPTION 'Cannot modify questions of a published survey (status: %)', survey_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER prevent_question_edit_on_active
  BEFORE INSERT OR UPDATE OR DELETE ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_active_survey_question_edit();

-- 4. Trigger to freeze question_options when survey goes active
CREATE OR REPLACE FUNCTION public.prevent_active_survey_option_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  survey_status survey_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT s.status INTO survey_status
    FROM public.questions q JOIN public.surveys s ON s.id = q.survey_id
    WHERE q.id = OLD.question_id;
  ELSE
    SELECT s.status INTO survey_status
    FROM public.questions q JOIN public.surveys s ON s.id = q.survey_id
    WHERE q.id = NEW.question_id;
  END IF;

  IF survey_status IN ('active', 'closed') THEN
    RAISE EXCEPTION 'Cannot modify options of a published survey (status: %)', survey_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER prevent_option_edit_on_active
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_options
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_active_survey_option_edit();

-- 5. Function to calculate quality score for a response
CREATE OR REPLACE FUNCTION public.calculate_response_quality(
  p_response_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_duration integer;
  v_min_duration integer;
  v_flags text[] := '{}';
  v_score numeric := 100;
  v_likert_answers integer[];
  v_likert_count integer;
  v_distinct_likert integer;
  v_survey_id uuid;
BEGIN
  -- Get response info
  SELECT r.duration_seconds, r.survey_id, s.minimum_duration_seconds
  INTO v_duration, v_survey_id, v_min_duration
  FROM public.responses r
  JOIN public.surveys s ON s.id = r.survey_id
  WHERE r.id = p_response_id;

  -- Speeder detection
  IF v_duration IS NOT NULL AND v_min_duration IS NOT NULL AND v_duration < v_min_duration THEN
    v_flags := array_append(v_flags, 'speeder');
    v_score := v_score - 40;
  END IF;

  -- Straightlining detection (all likert answers same value)
  SELECT array_agg(ra.numeric_value), count(*), count(DISTINCT ra.numeric_value)
  INTO v_likert_answers, v_likert_count, v_distinct_likert
  FROM public.response_answers ra
  JOIN public.questions q ON q.id = ra.question_id
  WHERE ra.response_id = p_response_id
    AND q.question_type IN ('likert', 'nps')
    AND ra.numeric_value IS NOT NULL;

  IF v_likert_count >= 3 AND v_distinct_likert = 1 THEN
    v_flags := array_append(v_flags, 'straightliner');
    v_score := v_score - 30;
  END IF;

  -- Empty required answers check
  IF EXISTS (
    SELECT 1
    FROM public.questions q
    LEFT JOIN public.response_answers ra ON ra.question_id = q.id AND ra.response_id = p_response_id
    WHERE q.survey_id = v_survey_id
      AND q.is_required = true
      AND ra.id IS NULL
  ) THEN
    v_flags := array_append(v_flags, 'incomplete');
    v_score := v_score - 20;
  END IF;

  -- Clamp score
  IF v_score < 0 THEN v_score := 0; END IF;

  -- Update response
  UPDATE public.responses
  SET quality_score = v_score,
      quality_flags = v_flags,
      is_valid = (v_score >= 40)
  WHERE id = p_response_id;

  RETURN jsonb_build_object('score', v_score, 'flags', v_flags, 'is_valid', v_score >= 40);
END;
$function$;

-- 6. Raking weights calculation function (iterative proportional fitting)
CREATE OR REPLACE FUNCTION public.calculate_raking_weights(
  p_survey_id uuid,
  p_max_iterations integer DEFAULT 50,
  p_convergence_threshold numeric DEFAULT 0.001,
  p_max_weight numeric DEFAULT 5.0
)
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
  -- Initialize all weights to 1
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

  -- Iterative raking
  WHILE v_iteration < p_max_iterations AND v_max_change > p_convergence_threshold LOOP
    v_max_change := 0;
    v_iteration := v_iteration + 1;

    -- For each demographic dimension
    FOR v_dimension IN
      SELECT DISTINCT dimension, category, census_proportion
      FROM public.demographic_weights
      WHERE census_proportion > 0
    LOOP
      -- Calculate current weighted proportion for this category
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

        -- Match respondent to category
        IF (v_dimension.dimension = 'gender' AND v_respondent.gender = v_dimension.category)
           OR (v_dimension.dimension = 'age_group' AND
               CASE
                 WHEN v_respondent.age_group IS NOT NULL THEN v_respondent.age_group = v_dimension.category
                 ELSE false
               END)
           OR (v_dimension.dimension = 'education_level' AND v_respondent.education_level = v_dimension.category)
           OR (v_dimension.dimension = 'income_bracket' AND v_respondent.income_bracket = v_dimension.category)
        THEN
          v_current_prop := v_current_prop + COALESCE((v_weights->>v_respondent.response_id::text)::numeric, 1);
        END IF;
      END LOOP;

      -- Calculate adjustment
      IF v_total_weight > 0 AND v_current_prop > 0 THEN
        v_current_prop := v_current_prop / v_total_weight;
        v_target_prop := v_dimension.census_proportion;
        v_adjustment := v_target_prop / v_current_prop;

        IF abs(v_adjustment - 1) > v_max_change THEN
          v_max_change := abs(v_adjustment - 1);
        END IF;

        -- Apply adjustment to matching respondents
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

  -- Trim weights (cap at max_weight, floor at 1/max_weight)
  FOR v_respondent IN SELECT * FROM jsonb_each_text(v_weights)
  LOOP
    IF v_respondent.value::numeric > p_max_weight THEN
      v_weights := jsonb_set(v_weights, ARRAY[v_respondent.key], to_jsonb(p_max_weight));
    ELSIF v_respondent.value::numeric < (1.0 / p_max_weight) THEN
      v_weights := jsonb_set(v_weights, ARRAY[v_respondent.key], to_jsonb(1.0 / p_max_weight));
    END IF;
  END LOOP;

  -- Calculate design effect: deff = n * sum(w^2) / (sum(w))^2
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
