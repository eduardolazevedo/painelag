import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, ChevronRight, Clock } from "lucide-react";
import { toast } from "sonner";

interface SurveyWidgetProps {
  surveyId: string;
  /** Compact mode for inline embedding */
  compact?: boolean;
  /** Callback when survey is completed */
  onComplete?: () => void;
  /** Custom class for the container */
  className?: string;
}

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

/**
 * Embeddable Survey Widget
 * 
 * Usage in super app:
 * ```tsx
 * <SurveyWidget surveyId="uuid" compact onComplete={() => console.log('done')} />
 * ```
 */
export default function SurveyWidget({ surveyId, compact = false, onComplete, className = "" }: SurveyWidgetProps) {
  const { user } = useAuth();
  const [survey, setSurvey] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (surveyId && user) loadSurvey();
  }, [surveyId, user]);

  const loadSurvey = async () => {
    // Check if already answered
    const { data: existing } = await supabase
      .from("responses")
      .select("id")
      .eq("survey_id", surveyId)
      .eq("user_id", user!.id)
      .not("completed_at", "is", null)
      .limit(1);

    if (existing && existing.length > 0) {
      setAlreadyAnswered(true);
      setLoading(false);
      return;
    }

    const [surveyRes, questionsRes] = await Promise.all([
      supabase.from("surveys").select("*").eq("id", surveyId).eq("status", "active").single(),
      supabase.from("questions").select("*").eq("survey_id", surveyId).order("display_order"),
    ]);

    if (!surveyRes.data) {
      setLoading(false);
      return;
    }

    setSurvey(surveyRes.data);
    const qs = questionsRes.data || [];
    const qIds = qs.map(q => q.id);

    const { data: opts } = await supabase
      .from("question_options")
      .select("*")
      .in("question_id", qIds)
      .order("display_order");

    setQuestions(qs.map(q => ({
      ...q,
      options: (opts || []).filter(o => o.question_id === q.id),
    })) as Question[]);

    startTimeRef.current = Date.now();
    setLoading(false);
  };

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  const handleSubmit = async () => {
    if (!user || !surveyId) return;
    const missing = questions.filter(q => q.is_required && (answers[q.id] === undefined || answers[q.id] === null || answers[q.id] === ""));
    if (missing.length > 0) {
      toast.error(`${missing.length} pergunta(s) obrigatória(s) pendente(s)`);
      setCurrentIndex(questions.indexOf(missing[0]));
      return;
    }

    setSubmitting(true);
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    try {
      // Check quotas
      const { data: quotaCheck } = await supabase.rpc("check_and_update_quota", {
        p_survey_id: surveyId,
        p_user_id: user.id,
      });
      const quotaResult = quotaCheck as unknown as { allowed: boolean };
      if (quotaResult && !quotaResult.allowed) {
        toast.error("Quota demográfica atingida para seu perfil.");
        setSubmitting(false);
        return;
      }

      const { data: response, error: respError } = await supabase
        .from("responses")
        .insert({ survey_id: surveyId, user_id: user.id, duration_seconds: durationSeconds })
        .select()
        .single();
      if (respError) throw respError;

      const answerRows = questions.map(q => {
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

      await supabase.from("response_answers").insert(answerRows);
      await supabase.from("responses").update({ completed_at: new Date().toISOString() }).eq("id", response.id);
      supabase.rpc("calculate_response_quality", { p_response_id: response.id }).then(() => {});

      setCompleted(true);
      onComplete?.();
    } catch {
      toast.error("Erro ao enviar respostas");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card className={`border-0 shadow-card ${className}`}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (alreadyAnswered) {
    return (
      <Card className={`border-0 shadow-card ${className}`}>
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-es-success shrink-0" />
          <p className="text-sm text-muted-foreground">Você já respondeu esta enquete.</p>
        </CardContent>
      </Card>
    );
  }

  if (!survey || questions.length === 0) {
    return null; // Don't render if survey not available
  }

  if (completed) {
    return (
      <Card className={`border-0 shadow-card ${className}`}>
        <CardContent className="text-center py-6">
          <CheckCircle2 className="h-8 w-8 text-es-success mx-auto mb-2" />
          <p className="font-medium text-sm">Obrigado pela participação!</p>
          <p className="text-xs text-muted-foreground mt-1">Sua resposta foi registrada com sucesso.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-0 shadow-card ${className}`}>
      <CardHeader className={compact ? "pb-2 px-4 pt-4" : "pb-3"}>
        <div className="flex items-center justify-between">
          <CardTitle className={compact ? "text-sm" : "text-base"}>{survey.title}</CardTitle>
          <Badge variant="outline" className="text-xs gap-1">
            <Clock className="h-3 w-3" />
            ~{survey.estimated_duration_minutes || 3}min
          </Badge>
        </div>
        <Progress value={progress} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className={compact ? "px-4 pb-4" : ""}>
        {currentQuestion && (
          <div className="space-y-3">
            <p className={`font-medium ${compact ? "text-sm" : ""}`}>
              {currentQuestion.question_text}
              {currentQuestion.is_required && <span className="text-secondary ml-1">*</span>}
            </p>

            <CompactQuestionInput
              question={currentQuestion}
              value={answers[currentQuestion.id]}
              onChange={val => setAnswers(prev => ({ ...prev, [currentQuestion.id]: val }))}
              compact={compact}
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                {currentIndex + 1}/{questions.length}
              </span>
              <div className="flex gap-2">
                {currentIndex > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setCurrentIndex(i => i - 1)}>
                    Anterior
                  </Button>
                )}
                {currentIndex < questions.length - 1 ? (
                  <Button size="sm" onClick={() => setCurrentIndex(i => i + 1)} className="gap-1">
                    Próxima <ChevronRight className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Enviar
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompactQuestionInput({ question, value, onChange, compact }: {
  question: Question; value: any; onChange: (v: any) => void; compact: boolean;
}) {
  switch (question.question_type) {
    case "multiple_choice_single":
      return (
        <RadioGroup value={value || ""} onValueChange={onChange} className="space-y-1.5">
          {question.options.map(opt => (
            <div key={opt.id} className={`flex items-center space-x-2 rounded-md border p-2 hover:bg-accent transition-colors ${compact ? "text-sm" : ""}`}>
              <RadioGroupItem value={opt.id} id={`w-${opt.id}`} />
              <Label htmlFor={`w-${opt.id}`} className="flex-1 cursor-pointer text-sm">{opt.option_text}</Label>
            </div>
          ))}
        </RadioGroup>
      );

    case "multiple_choice_multiple":
      const selected: string[] = value || [];
      return (
        <div className="space-y-1.5">
          {question.options.map(opt => (
            <div key={opt.id} className="flex items-center space-x-2 rounded-md border p-2 hover:bg-accent transition-colors">
              <Checkbox
                id={`w-${opt.id}`}
                checked={selected.includes(opt.id)}
                onCheckedChange={checked => onChange(checked ? [...selected, opt.id] : selected.filter(s => s !== opt.id))}
              />
              <Label htmlFor={`w-${opt.id}`} className="flex-1 cursor-pointer text-sm">{opt.option_text}</Label>
            </div>
          ))}
        </div>
      );

    case "likert":
      const max = question.config?.max || 5;
      return (
        <div className="space-y-2">
          <Slider value={[value ?? Math.ceil(max / 2)]} onValueChange={([v]) => onChange(v)} min={1} max={max} step={1} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{question.config?.labels?.min || "Discordo"}</span>
            <span className="font-bold text-primary">{value ?? "—"}</span>
            <span>{question.config?.labels?.max || "Concordo"}</span>
          </div>
        </div>
      );

    case "nps":
      return (
        <div className="grid grid-cols-11 gap-0.5">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              onClick={() => onChange(i)}
              className={`h-8 rounded text-xs font-medium transition-all ${
                value === i ? "bg-primary text-primary-foreground scale-110" : "bg-accent hover:bg-primary/10"
              }`}
            >
              {i}
            </button>
          ))}
        </div>
      );

    case "open_text":
      return (
        <Textarea
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder="Sua resposta..."
          className="min-h-[80px] text-sm"
          maxLength={2000}
        />
      );

    default:
      return <p className="text-xs text-muted-foreground">Tipo não suportado no widget.</p>;
  }
}
