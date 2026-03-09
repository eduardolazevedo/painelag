import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Survey, Question } from "./types";

export function useSurveyData(surveyId: string | undefined, onNotFound: () => void) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!surveyId) return;
    loadSurvey();
  }, [surveyId]);

  const loadSurvey = async () => {
    const [surveyRes, questionsRes] = await Promise.all([
      supabase.from("surveys").select("*").eq("id", surveyId!).single(),
      supabase.from("questions").select("*").eq("survey_id", surveyId!).order("display_order"),
    ]);

    if (surveyRes.error || !surveyRes.data) {
      toast.error("Enquete não encontrada");
      onNotFound();
      return;
    }

    setSurvey(surveyRes.data as Survey);

    const qs = questionsRes.data || [];
    const questionIds = qs.map((q) => q.id);
    const { data: options } = await supabase
      .from("question_options")
      .select("*")
      .in("question_id", questionIds)
      .order("display_order");

    setQuestions(
      qs.map((q) => ({
        ...q,
        options: (options || []).filter((o) => o.question_id === q.id),
      })) as Question[]
    );
    setLoading(false);
  };

  return { survey, questions, loading };
}
