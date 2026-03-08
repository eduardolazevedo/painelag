import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SurveyWidget, ResultsWidget } from "@/components/widgets";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Layout, Code2 } from "lucide-react";

export default function WidgetDemoPage() {
  const [surveys, setSurveys] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSurveys();
  }, []);

  const loadSurveys = async () => {
    const { data } = await supabase
      .from("surveys")
      .select("id, title")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(3);
    setSurveys(data || []);
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
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Layout className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold font-display">Widgets Embarcáveis</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Demonstração de widgets prontos para inserção em qualquer tela do super app
        </p>
      </div>

      {/* Usage example */}
      <Card className="border border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Code2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Como usar</span>
          </div>
          <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto font-mono">
{`import { SurveyWidget, ResultsWidget } from "@/components/widgets";

// Enquete inline compacta
<SurveyWidget surveyId="uuid" compact onComplete={() => refetch()} />

// Resultados resumidos
<ResultsWidget surveyId="uuid" compact />

// Resultado de uma pergunta específica
<ResultsWidget surveyId="uuid" questionId="q-uuid" compact />`}
          </pre>
        </CardContent>
      </Card>

      {surveys.length === 0 && (
        <Card className="border-0 shadow-card text-center py-8">
          <CardContent>
            <p className="text-muted-foreground">Nenhuma enquete ativa para demonstrar widgets.</p>
          </CardContent>
        </Card>
      )}

      {/* Simulated super app content with embedded widgets */}
      {surveys.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">
            Simulação: Conteúdo do Super App
          </h2>

          {/* Article-like content with inline survey */}
          <article className="prose prose-sm max-w-none">
            <div className="bg-accent/30 rounded-lg p-4 mb-4">
              <Badge variant="outline" className="mb-2">Widget: SurveyWidget compact</Badge>
              <p className="text-xs text-muted-foreground mb-3">
                Enquete inserida no meio do conteúdo editorial:
              </p>
              <SurveyWidget surveyId={surveys[0].id} compact />
            </div>
          </article>

          {/* Results widget compact */}
          <div className="bg-accent/30 rounded-lg p-4">
            <Badge variant="outline" className="mb-2">Widget: ResultsWidget compact</Badge>
            <p className="text-xs text-muted-foreground mb-3">
              Resultados resumidos inline (modo compacto):
            </p>
            <ResultsWidget surveyId={surveys[0].id} compact />
          </div>

          {/* Results widget full */}
          {surveys.length > 1 && (
            <div className="bg-accent/30 rounded-lg p-4">
              <Badge variant="outline" className="mb-2">Widget: ResultsWidget padrão</Badge>
              <p className="text-xs text-muted-foreground mb-3">
                Resultados com gráficos (modo padrão):
              </p>
              <ResultsWidget surveyId={surveys[1].id} />
            </div>
          )}

          {/* Full survey widget */}
          {surveys.length > 1 && (
            <div className="bg-accent/30 rounded-lg p-4">
              <Badge variant="outline" className="mb-2">Widget: SurveyWidget padrão</Badge>
              <p className="text-xs text-muted-foreground mb-3">
                Enquete modo padrão (maior):
              </p>
              <SurveyWidget surveyId={surveys[1].id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
