import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Users, Clock, TrendingUp, AlertTriangle, CheckCircle2, BarChart3, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface SurveyFieldwork {
  id: string;
  title: string;
  status: string;
  total_responses: number;
  valid_responses: number;
  avg_duration: number | null;
  completion_rate: number;
  quality_breakdown: { speeders: number; straightliners: number; incomplete: number };
  demographic_coverage: { gender: Record<string, number>; education: Record<string, number>; age_group: Record<string, number> };
}

export default function FieldworkDashboard() {
  const { user } = useAuth();
  const [surveys, setSurveys] = useState<SurveyFieldwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    checkAccess();
  }, [user]);

  const checkAccess = async () => {
    if (!user) { setAuthorized(false); setLoading(false); return; }
    const [adminRes, analystRes] = await Promise.all([
      supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: user.id, _role: "analyst" }),
    ]);
    const allowed = adminRes.data === true || analystRes.data === true;
    setAuthorized(allowed);
    if (allowed) loadFieldwork();
    else setLoading(false);
  };

  const loadFieldwork = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);

    const { data: activeSurveys } = await supabase
      .from("surveys")
      .select("id, title, status")
      .in("status", ["active", "closed"])
      .order("created_at", { ascending: false });

    if (!activeSurveys?.length) {
      setSurveys([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const fieldworkData = await Promise.all(
      activeSurveys.map(async (survey) => {
        const [responsesRes, answersRes] = await Promise.all([
          supabase
            .from("responses")
            .select("id, duration_seconds, completed_at, quality_score, quality_flags, is_valid")
            .eq("survey_id", survey.id),
          supabase
            .from("responses")
            .select("user_id, profiles!inner(gender, education_level, birth_year)")
            .eq("survey_id", survey.id)
            .not("completed_at", "is", null),
        ]);

        const responses = responsesRes.data || [];
        const completed = responses.filter((r) => r.completed_at);
        const valid = responses.filter((r) => r.is_valid !== false);
        const durations = completed.filter((r) => r.duration_seconds).map((r) => r.duration_seconds!);
        const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

        // Quality breakdown
        const allFlags = responses.flatMap((r) => (r.quality_flags as string[]) || []);
        const speeders = allFlags.filter((f) => f === "speeder").length;
        const straightliners = allFlags.filter((f) => f === "straightliner").length;
        const incomplete = allFlags.filter((f) => f === "incomplete").length;

        // Demographic coverage
        const profileData = (answersRes.data || []) as any[];
        const genderCounts: Record<string, number> = {};
        const educationCounts: Record<string, number> = {};
        const ageGroupCounts: Record<string, number> = {};

        const currentYear = new Date().getFullYear();
        profileData.forEach((r: any) => {
          const p = r.profiles;
          if (p?.gender) genderCounts[p.gender] = (genderCounts[p.gender] || 0) + 1;
          if (p?.education_level) educationCounts[p.education_level] = (educationCounts[p.education_level] || 0) + 1;
          if (p?.birth_year) {
            const age = currentYear - p.birth_year;
            const group = age < 25 ? "18-24" : age < 35 ? "25-34" : age < 45 ? "35-44" : age < 55 ? "45-54" : age < 65 ? "55-64" : "65+";
            ageGroupCounts[group] = (ageGroupCounts[group] || 0) + 1;
          }
        });

        return {
          ...survey,
          total_responses: responses.length,
          valid_responses: valid.length,
          avg_duration: avgDuration,
          completion_rate: responses.length > 0 ? (completed.length / responses.length) * 100 : 0,
          quality_breakdown: { speeders, straightliners, incomplete },
          demographic_coverage: { gender: genderCounts, education: educationCounts, age_group: ageGroupCounts },
        };
      })
    );

    setSurveys(fieldworkData);
    setLoading(false);
    setRefreshing(false);
    if (showRefresh) toast.success("Dados atualizados");
  };

  if (loading || authorized === null) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h3 className="text-lg font-semibold">Acesso restrito</h3>
        <p className="text-muted-foreground text-sm">Esta página é exclusiva para administradores e analistas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display">Dashboard de Campo</h2>
          <p className="text-muted-foreground text-sm">Acompanhamento em tempo real das enquetes ativas</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadFieldwork(true)} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {surveys.length === 0 ? (
        <Card className="border-0 shadow-card text-center py-12">
          <CardContent>
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhuma enquete ativa para monitorar.</p>
          </CardContent>
        </Card>
      ) : (
        surveys.map((survey) => (
          <Card key={survey.id} className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{survey.title}</CardTitle>
                  <CardDescription className="mt-1">
                    {survey.total_responses} respostas · {survey.valid_responses} válidas
                  </CardDescription>
                </div>
                <Badge variant={survey.status === "active" ? "default" : "secondary"}>
                  {survey.status === "active" ? "Ativa" : "Encerrada"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Key metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard icon={Users} label="Respostas" value={survey.total_responses} />
                <MetricCard icon={CheckCircle2} label="Válidas" value={survey.valid_responses} color="text-es-success" />
                <MetricCard icon={Clock} label="Tempo médio" value={survey.avg_duration ? `${Math.round(survey.avg_duration / 60)}min` : "—"} />
                <MetricCard icon={TrendingUp} label="Conclusão" value={`${Math.round(survey.completion_rate)}%`} />
              </div>

              {/* Quality issues */}
              {(survey.quality_breakdown.speeders > 0 || survey.quality_breakdown.straightliners > 0) && (
                <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium">Alertas de qualidade</span>
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    {survey.quality_breakdown.speeders > 0 && (
                      <span>{survey.quality_breakdown.speeders} speeders</span>
                    )}
                    {survey.quality_breakdown.straightliners > 0 && (
                      <span>{survey.quality_breakdown.straightliners} straightliners</span>
                    )}
                    {survey.quality_breakdown.incomplete > 0 && (
                      <span>{survey.quality_breakdown.incomplete} incompletos</span>
                    )}
                  </div>
                </div>
              )}

              {/* Demographic distribution */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Distribuição demográfica</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <DemographicBar title="Gênero" data={survey.demographic_coverage.gender} total={survey.valid_responses} />
                  <DemographicBar title="Faixa etária" data={survey.demographic_coverage.age_group} total={survey.valid_responses} />
                  <DemographicBar title="Escolaridade" data={survey.demographic_coverage.education} total={survey.valid_responses} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-center">
      <Icon className={`h-4 w-4 mx-auto mb-1 ${color || "text-muted-foreground"}`} />
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function DemographicBar({ title, data, total }: { title: string; data: Record<string, number>; total: number }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <p className="text-xs text-muted-foreground">Sem dados</p>
    </div>
  );

  const LABEL_MAP: Record<string, string> = {
    masculino: "Masc.", feminino: "Fem.", nao_binario: "N-B", prefiro_nao_dizer: "N/D",
    fundamental_incompleto: "Fund. Inc.", fundamental_completo: "Fund.", medio_incompleto: "Méd. Inc.",
    medio_completo: "Médio", superior_incompleto: "Sup. Inc.", superior_completo: "Superior", pos_graduacao: "Pós",
    ate_2sm: "≤2SM", "2_a_5sm": "2-5SM", "5_a_10sm": "5-10SM", "10_a_20sm": "10-20SM", acima_20sm: ">20SM",
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      {entries.slice(0, 5).map(([key, count]) => {
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={key} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="truncate">{LABEL_MAP[key] || key}</span>
              <span className="text-muted-foreground">{Math.round(pct)}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        );
      })}
    </div>
  );
}
