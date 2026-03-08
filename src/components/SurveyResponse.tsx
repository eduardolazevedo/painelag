import { useState, useEffect, useRef } from "react";
import { getErrorMessage } from "@/lib/errorMessages";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface QuestionOption {
  id: string;
  option_text: string;
  display_order: number;
}

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  display_order: number;
  is_required: boolean;
  config: any;
  options: QuestionOption[];
}

export default function SurveyResponse() {
  const { id: surveyId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!surveyId) return;
    loadSurvey();
    startTimeRef.current = Date.now();
  }, [surveyId]);

  const loadSurvey = async () => {
    const [surveyRes, questionsRes] = await Promise.all([
      supabase.from("surveys").select("*").eq("id", surveyId!).single(),
      supabase.from("questions").select("*").eq("survey_id", surveyId!).order("display_order"),
    ]);

    if (surveyRes.error || !surveyRes.data) {
      toast.error("Enquete não encontrada");
      navigate("/");
      return;
    }

    setSurvey(surveyRes.data);

    const qs = questionsRes.data || [];
    const questionIds = qs.map((q) => q.id);
    const { data: options } = await supabase
      .from("question_options")
      .select("*")
      .in("question_id", questionIds)
      .order("display_order");

    const questionsWithOptions = qs.map((q) => ({
      ...q,
      options: (options || []).filter((o) => o.question_id === q.id),
    }));

    setQuestions(questionsWithOptions);
    setLoading(false);
  };

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  const setAnswer = (questionId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    if (!user || !surveyId) return;

    // Check required answers
    const missing = questions.filter((q) => q.is_required && (answers[q.id] === undefined || answers[q.id] === null || answers[q.id] === ""));
    if (missing.length > 0) {
      toast.error(`Responda todas as perguntas obrigatórias (${missing.length} pendente${missing.length > 1 ? "s" : ""})`);
      const firstMissing = questions.indexOf(missing[0]);
      setCurrentIndex(firstMissing);
      return;
    }

    setSubmitting(true);
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    try {
      // Check quotas before creating response
      const { data: quotaCheck } = await supabase.rpc("check_and_update_quota", {
        p_survey_id: surveyId,
        p_user_id: user.id,
      });
      const quotaResult = quotaCheck as unknown as { allowed: boolean; reason?: string };
      if (quotaResult && !quotaResult.allowed) {
        toast.error("A quota demográfica para o seu perfil já foi atingida nesta enquete.");
        setSubmitting(false);
        return;
      }

      const { data: response, error: respError } = await supabase
        .from("responses")
        .insert({ survey_id: surveyId, user_id: user.id, duration_seconds: durationSeconds })
        .select()
        .single();

      if (respError) throw respError;

      const answerRows = questions.map((q) => {
        const ans = answers[q.id];
        const row: any = { response_id: response.id, question_id: q.id };

        switch (q.question_type) {
          case "multiple_choice_single":
            row.selected_option_id = ans || null;
            break;
          case "multiple_choice_multiple":
            row.selected_option_ids = ans || [];
            break;
          case "likert":
          case "nps":
            row.numeric_value = ans ?? null;
            break;
          case "ranking":
            row.ranking_order = ans || [];
            break;
          case "open_text":
            row.text_value = typeof ans === "string" ? ans.slice(0, 2000) : null;
            break;
        }
        return row;
      });

      const { error: ansError } = await supabase.from("response_answers").insert(answerRows);
      if (ansError) throw ansError;

      // Mark as completed
      await supabase
        .from("responses")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", response.id);

      // Trigger quality check (fire-and-forget via RPC)
      supabase.rpc("calculate_response_quality", { p_response_id: response.id }).then(() => {});

      toast.success("Obrigado pela sua participação!");
      navigate("/");
    } catch (err: any) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!survey || questions.length === 0) {
    return (
      <div className="container max-w-2xl py-12 text-center">
        <p className="text-muted-foreground">Enquete sem perguntas disponíveis.</p>
        <Button variant="ghost" onClick={() => navigate("/")} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <Button variant="ghost" onClick={() => navigate("/")} className="mb-4 gap-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">{survey.title}</h1>
        {survey.description && (
          <p className="text-muted-foreground mt-1">{survey.description}</p>
        )}
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>Pergunta {currentIndex + 1} de {questions.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <Card className="shadow-card border-0 animate-fade-in" key={currentQuestion.id}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold font-body">
            {currentQuestion.question_text}
            {currentQuestion.is_required && <span className="text-secondary ml-1">*</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QuestionInput
            question={currentQuestion}
            value={answers[currentQuestion.id]}
            onChange={(val) => setAnswer(currentQuestion.id, val)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Anterior
        </Button>

        {currentIndex < questions.length - 1 ? (
          <Button
            onClick={() => setCurrentIndex((i) => i + 1)}
            className="gap-2"
          >
            Próxima <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar respostas
          </Button>
        )}
      </div>
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: any;
  onChange: (val: any) => void;
}) {
  switch (question.question_type) {
    case "multiple_choice_single":
      return (
        <RadioGroup value={value || ""} onValueChange={onChange} className="space-y-3">
          {question.options.map((opt) => (
            <div key={opt.id} className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent transition-colors">
              <RadioGroupItem value={opt.id} id={opt.id} />
              <Label htmlFor={opt.id} className="flex-1 cursor-pointer">{opt.option_text}</Label>
            </div>
          ))}
        </RadioGroup>
      );

    case "multiple_choice_multiple":
      const selected: string[] = value || [];
      return (
        <div className="space-y-3">
          {question.options.map((opt) => (
            <div key={opt.id} className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent transition-colors">
              <Checkbox
                id={opt.id}
                checked={selected.includes(opt.id)}
                onCheckedChange={(checked) => {
                  onChange(
                    checked
                      ? [...selected, opt.id]
                      : selected.filter((s) => s !== opt.id)
                  );
                }}
              />
              <Label htmlFor={opt.id} className="flex-1 cursor-pointer">{opt.option_text}</Label>
            </div>
          ))}
        </div>
      );

    case "likert":
      const likertMax = question.config?.max || 5;
      const likertLabels = question.config?.labels || {};
      return (
        <div className="space-y-4">
          <Slider
            value={[value ?? Math.ceil(likertMax / 2)]}
            onValueChange={([v]) => onChange(v)}
            min={1}
            max={likertMax}
            step={1}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{likertLabels.min || "Discordo totalmente"}</span>
            <span className="text-lg font-bold text-primary">{value ?? "—"}</span>
            <span>{likertLabels.max || "Concordo totalmente"}</span>
          </div>
        </div>
      );

    case "nps":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => onChange(i)}
                className={`h-10 rounded-md text-sm font-medium transition-all ${
                  value === i
                    ? "bg-primary text-primary-foreground shadow-md scale-110"
                    : "bg-accent text-accent-foreground hover:bg-primary/10"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Nada provável</span>
            <span>Extremamente provável</span>
          </div>
        </div>
      );

    case "ranking":
      const items: string[] = value || question.options.map((o) => o.id);
      const optMap = Object.fromEntries(question.options.map((o) => [o.id, o.option_text]));
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-3">Arraste ou use as setas para ordenar por prioridade</p>
          {items.map((itemId, idx) => (
            <div key={itemId} className="flex items-center gap-3 rounded-lg border p-3 bg-card">
              <span className="text-sm font-bold text-primary w-6 text-center">{idx + 1}º</span>
              <span className="flex-1">{optMap[itemId] || itemId}</span>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => {
                    if (idx === 0) return;
                    const newItems = [...items];
                    [newItems[idx - 1], newItems[idx]] = [newItems[idx], newItems[idx - 1]];
                    onChange(newItems);
                  }}
                  disabled={idx === 0}
                  className="text-xs px-1 text-muted-foreground hover:text-primary disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => {
                    if (idx === items.length - 1) return;
                    const newItems = [...items];
                    [newItems[idx], newItems[idx + 1]] = [newItems[idx + 1], newItems[idx]];
                    onChange(newItems);
                  }}
                  disabled={idx === items.length - 1}
                  className="text-xs px-1 text-muted-foreground hover:text-primary disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
            </div>
          ))}
        </div>
      );

    case "open_text":
      return (
        <Textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Digite sua resposta aqui..."
          className="min-h-[120px]"
          maxLength={2000}
        />
      );

    default:
      return <p className="text-muted-foreground">Tipo de pergunta não suportado.</p>;
  }
}
