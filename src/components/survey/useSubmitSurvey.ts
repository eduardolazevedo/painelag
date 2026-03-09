import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errorMessages";
import { toast } from "sonner";
import type { Question } from "./types";

interface UseSubmitSurveyOptions {
  surveyId: string;
  userId: string;
  questions: Question[];
  answers: Record<string, any>;
  onSuccess: () => void;
  onMissingRequired: (index: number) => void;
}

export function useSubmitSurvey() {
  const [submitting, setSubmitting] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  const resetTimer = () => {
    startTimeRef.current = Date.now();
  };

  const submit = async ({ surveyId, userId, questions, answers, onSuccess, onMissingRequired }: UseSubmitSurveyOptions) => {
    const missing = questions.filter(
      (q) => q.is_required && (answers[q.id] === undefined || answers[q.id] === null || answers[q.id] === "")
    );
    if (missing.length > 0) {
      toast.error(`Responda todas as perguntas obrigatórias (${missing.length} pendente${missing.length > 1 ? "s" : ""})`);
      onMissingRequired(questions.indexOf(missing[0]));
      return;
    }

    setSubmitting(true);
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    try {
      const { data: quotaCheck } = await supabase.rpc("check_and_update_quota", {
        p_survey_id: surveyId,
        p_user_id: userId,
      });
      const quotaResult = quotaCheck as unknown as { allowed: boolean; reason?: string };
      if (quotaResult && !quotaResult.allowed) {
        toast.error("A quota demográfica para o seu perfil já foi atingida nesta enquete.");
        setSubmitting(false);
        return;
      }

      const { data: response, error: respError } = await supabase
        .from("responses")
        .insert({ survey_id: surveyId, user_id: userId, duration_seconds: durationSeconds })
        .select()
        .single();
      if (respError) throw respError;

      const answerRows = questions.map((q) => {
        const ans = answers[q.id];
        const row: any = { response_id: response.id, question_id: q.id };
        switch (q.question_type) {
          case "multiple_choice_single": row.selected_option_id = ans || null; break;
          case "multiple_choice_multiple": row.selected_option_ids = ans || []; break;
          case "likert": case "nps": row.numeric_value = ans ?? null; break;
          case "ranking": row.ranking_order = ans || []; break;
          case "open_text": row.text_value = typeof ans === "string" ? ans.slice(0, 2000) : null; break;
        }
        return row;
      });

      const { error: ansError } = await supabase.from("response_answers").insert(answerRows);
      if (ansError) throw ansError;

      await supabase.from("responses").update({ completed_at: new Date().toISOString() }).eq("id", response.id);
      supabase.rpc("calculate_response_quality", { p_response_id: response.id }).then(() => {});

      toast.success("Obrigado pela sua participação!");
      onSuccess();
    } catch (err: any) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return { submitting, submit, resetTimer };
}
