import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Loader2, BarChart3, TrendingUp, AlertTriangle, Download, RefreshCw, Users, Target, Activity } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ErrorBar } from "recharts";
import CrossTabulation from "@/components/CrossTabulation";

const COLORS = [
  "hsl(224, 67%, 33%)", "hsl(346, 58%, 58%)", "hsl(42, 85%, 55%)",
  "hsl(152, 60%, 40%)", "hsl(224, 60%, 50%)", "hsl(346, 55%, 72%)",
  "hsl(38, 92%, 50%)", "hsl(270, 50%, 50%)", "hsl(180, 50%, 40%)",
];

interface WeightingResult {
  weights: Record<string, number>;
  iterations: number;
  converged: boolean;
  respondent_count: number;
  design_effect: number;
  effective_n: number;
  margin_of_error_95: number;
  max_change: number;
  error?: string;
}

interface QuestionResult {
  question_id: string;
  question_text: string;
  question_type: string;
  options: { id: string; text: string }[];
  raw_counts: Record<string, number>;
  weighted_pcts: Record<string, number>;
  raw_pcts: Record<string, number>;
  avg_numeric?: number;
  weighted_avg_numeric?: number;
}

export default function WeightedResultsDashboard() {
  const { user } = useAuth();
  const [surveys, setSurveys] = useState<any[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>("");
  const [weighting, setWeighting] = useState<WeightingResult | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    checkAccess();
  }, [user]);

  const checkAccess = async () => {
    if (!user) return;
    const [admin, analyst, editor] = await Promise.all([
      supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: user.id, _role: "analyst" }),
      supabase.rpc("has_role", { _user_id: user.id, _role: "editor" }),
    ]);
    const allowed = !!admin.data || !!analyst.data || !!editor.data;
    setIsAllowed(allowed);
    if (allowed) loadSurveys();
    else setLoading(false);
  };

  const loadSurveys = async () => {
    const { data } = await supabase
      .from("surveys")
      .select("id, title, status")
      .in("status", ["active", "closed"])
      .order("created_at", { ascending: false });
    setSurveys(data || []);
    setLoading(false);
  };

  const calculateWeights = async (surveyId: string) => {
    setCalculating(true);
    try {
      const { data, error } = await supabase.rpc("calculate_raking_weights", {
        p_survey_id: surveyId,
      });
      if (error) throw error;
      const result = data as unknown as WeightingResult;
      setWeighting(result);
      if (!result.error) {
        await loadResults(surveyId, result.weights);
      }
    } catch (err: any) {
      toast.error("Erro ao calcular ponderação");
      console.error(err);
    } finally {
      setCalculating(false);
    }
  };

  const loadResults = async (surveyId: string, weights: Record<string, number>) => {
    // Load questions + options
    const { data: qs } = await supabase
      .from("questions")
      .select("*")
      .eq("survey_id", surveyId)
      .order("display_order");

    if (!qs) return;

    const qIds = qs.map(q => q.id);
    const [optsRes, answersRes] = await Promise.all([
      supabase.from("question_options").select("*").in("question_id", qIds).order("display_order"),
      supabase.from("response_answers").select("*, responses!inner(id, is_valid, completed_at)")
        .in("question_id", qIds),
    ]);

    const opts = optsRes.data || [];
    const answers = (answersRes.data || []).filter((a: any) => a.responses?.completed_at && a.responses?.is_valid !== false);

    const questionResults: QuestionResult[] = qs.map(q => {
      const qOpts = opts.filter(o => o.question_id === q.id);
      const qAnswers = answers.filter((a: any) => a.question_id === q.id);

      const rawCounts: Record<string, number> = {};
      const weightedCounts: Record<string, number> = {};
      let numericSum = 0, weightedNumericSum = 0, numericCount = 0, totalWeight = 0;

      qAnswers.forEach((a: any) => {
        const w = weights[a.response_id] || 1;

        if (q.question_type === "multiple_choice_single" && a.selected_option_id) {
          rawCounts[a.selected_option_id] = (rawCounts[a.selected_option_id] || 0) + 1;
          weightedCounts[a.selected_option_id] = (weightedCounts[a.selected_option_id] || 0) + w;
        } else if (q.question_type === "multiple_choice_multiple" && a.selected_option_ids) {
          (a.selected_option_ids as string[]).forEach(optId => {
            rawCounts[optId] = (rawCounts[optId] || 0) + 1;
            weightedCounts[optId] = (weightedCounts[optId] || 0) + w;
          });
        } else if ((q.question_type === "likert" || q.question_type === "nps") && a.numeric_value != null) {
          numericSum += a.numeric_value;
          weightedNumericSum += a.numeric_value * w;
          numericCount++;
          totalWeight += w;
        }
      });

      const totalRaw = Object.values(rawCounts).reduce((a, b) => a + b, 0) || 1;
      const totalWeighted = Object.values(weightedCounts).reduce((a, b) => a + b, 0) || 1;

      const rawPcts: Record<string, number> = {};
      const weightedPcts: Record<string, number> = {};
      Object.keys(rawCounts).forEach(k => {
        rawPcts[k] = (rawCounts[k] / totalRaw) * 100;
        weightedPcts[k] = ((weightedCounts[k] || 0) / totalWeighted) * 100;
      });

      return {
        question_id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: qOpts.map(o => ({ id: o.id, text: o.option_text })),
        raw_counts: rawCounts,
        weighted_pcts: weightedPcts,
        raw_pcts: rawPcts,
        avg_numeric: numericCount > 0 ? numericSum / numericCount : undefined,
        weighted_avg_numeric: totalWeight > 0 ? weightedNumericSum / totalWeight : undefined,
      };
    });

    setResults(questionResults);
  };

  const handleSurveySelect = (id: string) => {
    setSelectedSurveyId(id);
    setWeighting(null);
    setResults([]);
    calculateWeights(id);
  };

  const exportCSV = () => {
    if (!results.length) return;
    const lines = ["Pergunta,Opção,Respostas Brutas,% Bruta,% Ponderada"];
    results.forEach(r => {
      if (r.options.length > 0) {
        r.options.forEach(o => {
          lines.push(`"${r.question_text}","${o.text}",${r.raw_counts[o.id] || 0},${(r.raw_pcts[o.id] || 0).toFixed(1)},${(r.weighted_pcts[o.id] || 0).toFixed(1)}`);
        });
      } else if (r.avg_numeric !== undefined) {
        lines.push(`"${r.question_text}","Média",—,${r.avg_numeric.toFixed(2)},${r.weighted_avg_numeric?.toFixed(2) || "—"}`);
      }
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "resultados_ponderados.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isAllowed) {
    return (
      <div className="container max-w-2xl py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Acesso restrito</h2>
        <p className="text-muted-foreground">Apenas administradores, editores e analistas podem visualizar resultados ponderados.</p>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Resultados Ponderados</h1>
          <p className="text-muted-foreground text-sm">Análise com ponderação demográfica (Raking/IPF)</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedSurveyId} onValueChange={handleSurveySelect}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione uma enquete" />
            </SelectTrigger>
            <SelectContent>
              {surveys.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {results.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
              <Download className="h-4 w-4" /> CSV
            </Button>
          )}
        </div>
      </div>

      {calculating && (
        <Card className="border-0 shadow-card text-center py-12">
          <CardContent>
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Calculando ponderação demográfica...</p>
          </CardContent>
        </Card>
      )}

      {weighting && !calculating && (
        <>
          {/* Statistical summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard icon={Users} label="Respondentes" value={weighting.respondent_count} />
            <StatCard icon={Target} label="N efetivo" value={weighting.effective_n?.toFixed(1) || "—"} />
            <StatCard icon={Activity} label="Design Effect" value={weighting.design_effect?.toFixed(2) || "—"} />
            <StatCard
              icon={TrendingUp}
              label="MoE (95% IC)"
              value={`±${weighting.margin_of_error_95?.toFixed(1) || "—"}pp`}
              highlight
            />
            <StatCard
              icon={weighting.converged ? TrendingUp : AlertTriangle}
              label="Convergiu"
              value={weighting.converged ? `Sim (${weighting.iterations} iter.)` : "Não"}
              color={weighting.converged ? "text-es-success" : "text-destructive"}
            />
          </div>

          {(weighting as any).error && (
            <Card className="border border-es-warning/30 bg-es-warning/5">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-es-warning shrink-0" />
                <p className="text-sm">{(weighting as any).error}</p>
              </CardContent>
            </Card>
          )}

          {/* Question results */}
          {results.map(r => (
            <div key={r.question_id} className="space-y-2">
              <QuestionResultCard result={r} moe={weighting.margin_of_error_95} effectiveN={weighting.effective_n} />
              {r.question_type === "multiple_choice_single" && (
                <CrossTabulation
                  surveyId={selectedSurveyId}
                  questionId={r.question_id}
                  questionText={r.question_text}
                  weights={weighting.weights}
                />
              )}
            </div>
          ))}
        </>
      )}

      {!selectedSurveyId && !calculating && (
        <Card className="border-0 shadow-card text-center py-12">
          <CardContent>
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Selecione uma enquete para ver os resultados ponderados</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, highlight, color }: {
  icon: any; label: string; value: string | number; highlight?: boolean; color?: string;
}) {
  return (
    <Card className={`border-0 shadow-card ${highlight ? "ring-1 ring-primary/20" : ""}`}>
      <CardContent className="p-4 text-center">
        <Icon className={`h-4 w-4 mx-auto mb-1 ${color || "text-muted-foreground"}`} />
        <div className={`text-lg font-bold ${color || ""}`}>{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function QuestionResultCard({ result, moe, effectiveN }: { result: QuestionResult; moe: number; effectiveN: number }) {
  const isChoice = result.question_type === "multiple_choice_single" || result.question_type === "multiple_choice_multiple";
  const isNumeric = result.question_type === "likert" || result.question_type === "nps";

  if (isChoice && result.options.length > 0) {
    const chartData = result.options.map((o, i) => {
      const p = (result.weighted_pcts[o.id] || 0) / 100;
      // Wilson CI for proportion
      const ci = effectiveN > 0
        ? 1.96 * Math.sqrt((p * (1 - p)) / effectiveN) * 100
        : 0;
      return {
        name: o.text.length > 25 ? o.text.slice(0, 22) + "..." : o.text,
        fullName: o.text,
        bruto: parseFloat((result.raw_pcts[o.id] || 0).toFixed(1)),
        ponderado: parseFloat((result.weighted_pcts[o.id] || 0).toFixed(1)),
        ci: parseFloat(ci.toFixed(1)),
        count: result.raw_counts[o.id] || 0,
      };
    });

    return (
      <Card className="border-0 shadow-card animate-fade-in">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-body">{result.question_text}</CardTitle>
          <CardDescription>
            {result.question_type === "multiple_choice_multiple" ? "Múltipla resposta" : "Resposta única"}
            {" · MoE ±"}{moe?.toFixed(1)}pp
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [`${value}%`, name === "bruto" ? "Bruto" : "Ponderado"]}
                  labelFormatter={(label: string, payload: any[]) => payload?.[0]?.payload?.fullName || label}
                />
                <Bar dataKey="bruto" fill="hsl(224, 60%, 50%)" opacity={0.4} name="bruto" radius={[0, 2, 2, 0]} />
                <Bar dataKey="ponderado" fill="hsl(224, 67%, 33%)" name="ponderado" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-1">
            {result.options.map((o, i) => (
              <div key={o.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  {o.text}
                </span>
                <span className="text-muted-foreground">
                  {(result.weighted_pcts[o.id] || 0).toFixed(1)}%
                  <span className="text-xs ml-1">({result.raw_counts[o.id] || 0})</span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isNumeric) {
    const max = result.question_type === "nps" ? 10 : 5;
    return (
      <Card className="border-0 shadow-card animate-fade-in">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-body">{result.question_text}</CardTitle>
          <CardDescription>
            {result.question_type === "nps" ? "NPS (0-10)" : `Likert (1-${max})`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Média Bruta</p>
              <p className="text-3xl font-bold">{result.avg_numeric?.toFixed(2) || "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Média Ponderada</p>
              <p className="text-3xl font-bold text-primary">{result.weighted_avg_numeric?.toFixed(2) || "—"}</p>
            </div>
          </div>
          {result.avg_numeric !== undefined && result.weighted_avg_numeric !== undefined && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>0</span>
                <span>Diferença: {(result.weighted_avg_numeric - result.avg_numeric).toFixed(2)}</span>
                <span>{max}</span>
              </div>
              <div className="relative h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-primary/30 rounded-full"
                  style={{ width: `${(result.avg_numeric / max) * 100}%` }}
                />
                <div
                  className="absolute h-full bg-primary rounded-full"
                  style={{ width: `${(result.weighted_avg_numeric / max) * 100}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Open text / ranking - just show count
  return (
    <Card className="border-0 shadow-card animate-fade-in">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-body">{result.question_text}</CardTitle>
        <CardDescription>
          {result.question_type === "open_text" ? "Texto aberto" : "Ranking"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Visualização detalhada não disponível para este tipo de pergunta.
        </p>
      </CardContent>
    </Card>
  );
}
