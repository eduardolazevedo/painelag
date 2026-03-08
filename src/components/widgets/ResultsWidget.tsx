import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface ResultsWidgetProps {
  surveyId: string;
  /** Show only specific question */
  questionId?: string;
  /** Compact mode for inline embedding */
  compact?: boolean;
  /** Show raw or public-facing results (no weighting for public) */
  showWeighted?: boolean;
  /** Custom class */
  className?: string;
}

interface QuestionResult {
  id: string;
  text: string;
  type: string;
  options: { id: string; text: string }[];
  counts: Record<string, number>;
  pcts: Record<string, number>;
  total: number;
  avg?: number;
}

/**
 * Embeddable Results Widget
 * 
 * Usage in super app:
 * ```tsx
 * <ResultsWidget surveyId="uuid" compact />
 * <ResultsWidget surveyId="uuid" questionId="q-uuid" compact />
 * ```
 */
export default function ResultsWidget({ surveyId, questionId, compact = false, showWeighted = false, className = "" }: ResultsWidgetProps) {
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [surveyTitle, setSurveyTitle] = useState("");
  const [respondentCount, setRespondentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (surveyId) loadResults();
  }, [surveyId, questionId]);

  const loadResults = async () => {
    // Check if survey allows public results
    const { data: survey } = await supabase
      .from("surveys")
      .select("title, is_public_results, status")
      .eq("id", surveyId)
      .single();

    if (!survey || (!survey.is_public_results && !showWeighted)) {
      setLoading(false);
      return;
    }

    setSurveyTitle(survey.title);

    // Count respondents
    const { count } = await supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("survey_id", surveyId)
      .not("completed_at", "is", null);
    setRespondentCount(count || 0);

    // Load questions
    let qQuery = supabase.from("questions").select("*").eq("survey_id", surveyId).order("display_order");
    if (questionId) qQuery = qQuery.eq("id", questionId);

    const { data: qs } = await qQuery;
    if (!qs || qs.length === 0) { setLoading(false); return; }

    const qIds = qs.map(q => q.id);
    const [optsRes, answersRes] = await Promise.all([
      supabase.from("question_options").select("*").in("question_id", qIds).order("display_order"),
      supabase.from("response_answers")
        .select("*, responses!inner(id, completed_at, is_valid)")
        .in("question_id", qIds),
    ]);

    const opts = optsRes.data || [];
    const answers = (answersRes.data || []).filter((a: any) => a.responses?.completed_at && a.responses?.is_valid !== false);

    const processed: QuestionResult[] = qs
      .filter(q => ["multiple_choice_single", "multiple_choice_multiple", "likert", "nps"].includes(q.question_type))
      .map(q => {
        const qOpts = opts.filter(o => o.question_id === q.id);
        const qAnswers = answers.filter((a: any) => a.question_id === q.id);

        const counts: Record<string, number> = {};
        let numSum = 0, numCount = 0;

        qAnswers.forEach((a: any) => {
          if (q.question_type === "multiple_choice_single" && a.selected_option_id) {
            counts[a.selected_option_id] = (counts[a.selected_option_id] || 0) + 1;
          } else if (q.question_type === "multiple_choice_multiple" && a.selected_option_ids) {
            (a.selected_option_ids as string[]).forEach(oid => {
              counts[oid] = (counts[oid] || 0) + 1;
            });
          } else if ((q.question_type === "likert" || q.question_type === "nps") && a.numeric_value != null) {
            numSum += a.numeric_value;
            numCount++;
          }
        });

        const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
        const pcts: Record<string, number> = {};
        Object.keys(counts).forEach(k => { pcts[k] = (counts[k] / total) * 100; });

        return {
          id: q.id,
          text: q.question_text,
          type: q.question_type,
          options: qOpts.map(o => ({ id: o.id, text: o.option_text })),
          counts,
          pcts,
          total,
          avg: numCount > 0 ? numSum / numCount : undefined,
        };
      });

    setResults(processed);
    setLoading(false);
  };

  if (loading) {
    return (
      <Card className={`border-0 shadow-card ${className}`}>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {!questionId && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className={`font-medium ${compact ? "text-sm" : ""}`}>{surveyTitle}</span>
          </div>
          <Badge variant="outline" className="text-xs gap-1">
            <Users className="h-3 w-3" /> {respondentCount}
          </Badge>
        </div>
      )}

      {results.map(r => (
        <CompactResultCard key={r.id} result={r} compact={compact} />
      ))}
    </div>
  );
}

function CompactResultCard({ result, compact }: { result: QuestionResult; compact: boolean }) {
  const isChoice = result.type === "multiple_choice_single" || result.type === "multiple_choice_multiple";

  if (isChoice && result.options.length > 0) {
    const chartData = result.options
      .map(o => ({
        name: compact && o.text.length > 18 ? o.text.slice(0, 16) + "…" : o.text.length > 30 ? o.text.slice(0, 28) + "…" : o.text,
        pct: parseFloat((result.pcts[o.id] || 0).toFixed(1)),
        count: result.counts[o.id] || 0,
      }))
      .sort((a, b) => b.pct - a.pct);

    if (compact) {
      // Horizontal bars inline
      return (
        <Card className="border-0 shadow-card">
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-medium">{result.text}</p>
            {chartData.map((d, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="font-medium">{d.pct}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${d.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-0 shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-body">{result.text}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v}%`, "Respostas"]} />
                <Bar dataKey="pct" fill="hsl(224, 67%, 33%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Numeric (likert/nps)
  if (result.avg !== undefined) {
    const max = result.type === "nps" ? 10 : 5;
    return (
      <Card className="border-0 shadow-card">
        <CardContent className={compact ? "p-3" : "p-4"}>
          <p className={`font-medium mb-2 ${compact ? "text-xs" : "text-sm"}`}>{result.text}</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-primary">{result.avg.toFixed(1)}</span>
            <div className="flex-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${(result.avg / max) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                <span>0</span>
                <span>{max}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
