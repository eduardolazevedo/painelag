import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import SurveyCard from "@/components/SurveyCard";
import { Loader2, BarChart3, TrendingUp, Users } from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();
  const [surveys, setSurveys] = useState<any[]>([]);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    const [surveysRes, responsesRes] = await Promise.all([
      supabase
        .from("surveys")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      supabase
        .from("responses")
        .select("survey_id")
        .eq("user_id", user!.id),
    ]);

    setSurveys(surveysRes.data || []);
    setAnsweredIds(new Set((responsesRes.data || []).map((r) => r.survey_id)));
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      {/* Hero stats */}
      <div className="gradient-hero rounded-xl p-6 mb-8 text-primary-foreground">
        <h1 className="text-3xl font-bold mb-2">Olá, bem-vindo ao PainelES</h1>
        <p className="text-primary-foreground/80 mb-6">
          Sua opinião ajuda a construir um jornalismo mais conectado com o Espírito Santo.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-primary-foreground/10 rounded-lg p-3 text-center backdrop-blur-sm">
            <BarChart3 className="h-5 w-5 mx-auto mb-1" />
            <span className="text-2xl font-bold">{surveys.length}</span>
            <p className="text-xs text-primary-foreground/70">Enquetes ativas</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-lg p-3 text-center backdrop-blur-sm">
            <TrendingUp className="h-5 w-5 mx-auto mb-1" />
            <span className="text-2xl font-bold">{answeredIds.size}</span>
            <p className="text-xs text-primary-foreground/70">Respondidas</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-lg p-3 text-center backdrop-blur-sm">
            <Users className="h-5 w-5 mx-auto mb-1" />
            <span className="text-2xl font-bold">{surveys.length - answeredIds.size}</span>
            <p className="text-xs text-primary-foreground/70">Pendentes</p>
          </div>
        </div>
      </div>

      {/* Survey list */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Enquetes disponíveis</h2>
        {surveys.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhuma enquete ativa no momento.</p>
            <p className="text-sm text-muted-foreground mt-1">Volte em breve!</p>
          </div>
        ) : (
          surveys.map((survey) => (
            <SurveyCard
              key={survey.id}
              id={survey.id}
              title={survey.title}
              description={survey.description}
              estimatedMinutes={survey.estimated_duration_minutes}
              tags={survey.tags}
              answered={answeredIds.has(survey.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
