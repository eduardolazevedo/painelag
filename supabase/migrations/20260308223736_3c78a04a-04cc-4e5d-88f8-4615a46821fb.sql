
-- Survey templates table
CREATE TABLE public.survey_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  estimated_duration_minutes integer DEFAULT 3,
  minimum_duration_seconds integer DEFAULT 30,
  tags text[] DEFAULT '{}',
  is_public_results boolean DEFAULT false,
  -- Recurrence config
  recurrence_type text NOT NULL DEFAULT 'none' CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly')),
  recurrence_day_of_week integer, -- 0=Sunday, 1=Monday, ...
  recurrence_day_of_month integer, -- 1-28
  auto_close_after_hours integer DEFAULT 168, -- 7 days default
  is_active boolean DEFAULT true,
  last_generated_at timestamptz,
  next_generation_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Template questions
CREATE TABLE public.template_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.survey_templates(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type question_type NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_required boolean DEFAULT true,
  config jsonb DEFAULT '{}'
);

-- Template question options
CREATE TABLE public.template_question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.template_questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  value text
);

-- RLS
ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_question_options ENABLE ROW LEVEL SECURITY;

-- Policies for survey_templates
CREATE POLICY "Admins and editors can manage templates"
  ON public.survey_templates FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'editor'));

CREATE POLICY "Authenticated can view active templates"
  ON public.survey_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Policies for template_questions
CREATE POLICY "Admins and editors can manage template questions"
  ON public.template_questions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'editor'));

CREATE POLICY "Authenticated can view template questions"
  ON public.template_questions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.survey_templates st
    WHERE st.id = template_questions.template_id AND st.is_active = true
  ));

-- Policies for template_question_options
CREATE POLICY "Admins and editors can manage template options"
  ON public.template_question_options FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'editor'));

CREATE POLICY "Authenticated can view template options"
  ON public.template_question_options FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.template_questions tq
    JOIN public.survey_templates st ON st.id = tq.template_id
    WHERE tq.id = template_question_options.question_id AND st.is_active = true
  ));

-- Trigger for updated_at
CREATE TRIGGER update_survey_templates_updated_at
  BEFORE UPDATE ON public.survey_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
