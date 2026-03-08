import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, Users, Calendar } from "lucide-react";

interface SurveyResult {
  id: string;
  title: string;
  description: string | null;
  response_count: number;
  ends_at: string | null;
}

export default function PublicResults() {
  const [surveys, setSurveys] = useState<SurveyResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    const { data } = await supabase
      .from("surveys")
      .select("id, title, description, ends_at, is_public_results")
      .eq("is_public_results", true)
      .in("status", ["active", "closed"])
      .order("created_at", { ascending: false });

    if (data) {
      // Get response counts
      const resultsWithCounts = await Promise.all(
        data.map(async (s) => {
          const { count } = await supabase
            .from("responses")
            .select("*", { count: "exact", head: true })
            .eq("survey_id", s.id);
          return { ...s, response_count: count || 0 };
        })
      );
      setSurveys(resultsWithCounts);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">Resultados Públicos</h1>
        <p className="text-muted-foreground mt-2">
          Confira os resultados das pesquisas realizadas pelo PainelES
        </p>
      </div>

      {surveys.length === 0 ? (
        <Card className="border-0 shadow-card text-center py-12">
          <CardContent>
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum resultado público disponível ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {surveys.map((survey) => (
            <Card key={survey.id} className="border-0 shadow-card hover:shadow-elevated transition-all animate-fade-in">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{survey.title}</CardTitle>
                  <Badge variant="outline" className="shrink-0">Público</Badge>
                </div>
                {survey.description && (
                  <p className="text-sm text-muted-foreground">{survey.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {survey.response_count.toLocaleString("pt-BR")} respostas
                  </span>
                  {survey.ends_at && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(survey.ends_at).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
