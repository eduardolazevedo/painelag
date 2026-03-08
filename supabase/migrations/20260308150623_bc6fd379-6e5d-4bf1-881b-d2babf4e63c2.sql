
-- Enum para tipos de pergunta
CREATE TYPE public.question_type AS ENUM ('multiple_choice_single', 'multiple_choice_multiple', 'likert', 'nps', 'ranking', 'open_text');

-- Enum para status de enquete
CREATE TYPE public.survey_status AS ENUM ('draft', 'active', 'closed', 'archived');

-- Enum para papéis
CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'analyst', 'panelist');

-- Função auxiliar de timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Tabela de perfis
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  -- Campos demográficos (preenchimento futuro)
  birth_year INTEGER,
  gender TEXT,
  education_level TEXT,
  income_bracket TEXT,
  municipality TEXT,
  state TEXT DEFAULT 'ES',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-criar perfil no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Tabela de papéis
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Enquetes
CREATE TABLE public.surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status survey_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_public_results BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  estimated_duration_minutes INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active surveys visible to authenticated" ON public.surveys
  FOR SELECT TO authenticated USING (status = 'active' OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor') OR public.has_role(auth.uid(), 'analyst'));

CREATE POLICY "Editors and admins can create surveys" ON public.surveys
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

CREATE POLICY "Editors and admins can update surveys" ON public.surveys
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

CREATE TRIGGER update_surveys_updated_at BEFORE UPDATE ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Perguntas
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID REFERENCES public.surveys(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  question_type question_type NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Questions visible with survey" ON public.questions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.surveys s WHERE s.id = survey_id AND (s.status = 'active' OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor') OR public.has_role(auth.uid(), 'analyst')))
  );

CREATE POLICY "Editors can manage questions" ON public.questions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

CREATE INDEX idx_questions_survey ON public.questions(survey_id, display_order);

-- Opções de resposta
CREATE TABLE public.question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
  option_text TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  value TEXT
);

ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Options visible with question" ON public.question_options
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.questions q JOIN public.surveys s ON s.id = q.survey_id WHERE q.id = question_id AND (s.status = 'active' OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor')))
  );

CREATE POLICY "Editors can manage options" ON public.question_options
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

CREATE INDEX idx_options_question ON public.question_options(question_id, display_order);

-- Respostas (1 por user/survey)
CREATE TABLE public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID REFERENCES public.surveys(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  UNIQUE (survey_id, user_id)
);

ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own responses" ON public.responses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own response" ON public.responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own response" ON public.responses
  FOR UPDATE USING (auth.uid() = user_id AND completed_at IS NULL);

CREATE POLICY "Analysts can view all responses" ON public.responses
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'));

CREATE INDEX idx_responses_survey ON public.responses(survey_id);
CREATE INDEX idx_responses_user ON public.responses(user_id);

-- Respostas atômicas por pergunta
CREATE TABLE public.response_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID REFERENCES public.responses(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
  selected_option_id UUID REFERENCES public.question_options(id),
  selected_option_ids UUID[] DEFAULT '{}',
  numeric_value INTEGER,
  text_value TEXT,
  ranking_order UUID[] DEFAULT '{}',
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.response_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own answers" ON public.response_answers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.responses r WHERE r.id = response_id AND r.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own answers" ON public.response_answers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.responses r WHERE r.id = response_id AND r.user_id = auth.uid())
  );

CREATE POLICY "Analysts can view all answers" ON public.response_answers
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'));

CREATE INDEX idx_answers_response ON public.response_answers(response_id);
CREATE INDEX idx_answers_question ON public.response_answers(question_id);
CREATE INDEX idx_answers_option ON public.response_answers(selected_option_id);

-- Sugestões do público
CREATE TABLE public.survey_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  upvotes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view suggestions" ON public.survey_suggestions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create suggestions" ON public.survey_suggestions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own suggestions" ON public.survey_suggestions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage suggestions" ON public.survey_suggestions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

CREATE INDEX idx_suggestions_status ON public.survey_suggestions(status);

-- Pesos demográficos para ponderação
CREATE TABLE public.demographic_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension TEXT NOT NULL,
  category TEXT NOT NULL,
  census_proportion NUMERIC(6,5) NOT NULL,
  panel_proportion NUMERIC(6,5),
  weight NUMERIC(8,5) DEFAULT 1.0,
  reference_source TEXT DEFAULT 'IBGE Censo 2022',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dimension, category)
);

ALTER TABLE public.demographic_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Analysts can view weights" ON public.demographic_weights
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'));

CREATE POLICY "Admins can manage weights" ON public.demographic_weights
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
