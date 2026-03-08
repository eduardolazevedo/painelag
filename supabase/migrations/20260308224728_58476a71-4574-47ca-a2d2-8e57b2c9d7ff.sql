
CREATE OR REPLACE FUNCTION public.guard_suggestion_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.upvotes := 0;
  NEW.status := 'pending';
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_suggestion_insert_trigger
  BEFORE INSERT ON public.survey_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_suggestion_insert();
