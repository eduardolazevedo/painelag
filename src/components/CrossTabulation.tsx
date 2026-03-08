import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Table2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

const DIMENSIONS = [
  { value: "gender", label: "Gênero" },
  { value: "age_group", label: "Faixa etária" },
  { value: "education_level", label: "Escolaridade" },
  { value: "income_bracket", label: "Renda" },
];

interface CrossTabResult {
  crosstab: Record<string, Record<string, number>>;
  options: { id: string; text: string }[];
  categories: string[];
  row_totals: Record<string, number>;
  col_totals: Record<string, number>;
  total: number;
  chi_square: number;
  degrees_of_freedom: number;
  significant_005: boolean;
}

interface Props {
  surveyId: string;
  questionId: string;
  questionText: string;
  weights: Record<string, number> | null;
}

export default function CrossTabulation({ surveyId, questionId, questionText, weights }: Props) {
  const [dimension, setDimension] = useState<string>("");
  const [result, setResult] = useState<CrossTabResult | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCrossTab = async (dim: string) => {
    setDimension(dim);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("cross_tabulate", {
        p_survey_id: surveyId,
        p_question_id: questionId,
        p_dimension: dim,
        p_weights: weights || undefined,
      });
      if (error) throw error;
      setResult(data as unknown as CrossTabResult);
    } catch {
      toast.error("Erro ao carregar cruzamento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-card mt-3">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-body">Cruzamento: {questionText}</CardTitle>
            <CardDescription className="text-xs">Tabela cruzada com teste χ²</CardDescription>
          </div>
          <Select value={dimension} onValueChange={loadCrossTab}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Dimensão" />
            </SelectTrigger>
            <SelectContent>
              {DIMENSIONS.map(d => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {result && !loading && (
          <div className="space-y-3">
            {/* Chi-square badge */}
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="gap-1">
                χ² = {result.chi_square} (df={result.degrees_of_freedom})
              </Badge>
              {result.significant_005 ? (
                <Badge className="bg-es-success/10 text-es-success gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Significativo (p &lt; 0.05)
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="h-3 w-3" /> Não significativo
                </Badge>
              )}
              <span className="text-muted-foreground ml-auto">N = {result.total?.toFixed(0)}</span>
            </div>

            {/* Cross-tab table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-muted-foreground">
                      {DIMENSIONS.find(d => d.value === dimension)?.label}
                    </th>
                    {result.options?.map(o => (
                      <th key={o.id} className="text-center p-2 font-medium">
                        {o.text.length > 20 ? o.text.slice(0, 18) + "…" : o.text}
                      </th>
                    ))}
                    <th className="text-center p-2 font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.categories?.map(cat => {
                    const rowTotal = result.row_totals?.[cat] || 0;
                    return (
                      <tr key={cat} className="border-b hover:bg-accent/50">
                        <td className="p-2 font-medium">{cat}</td>
                        {result.options?.map(o => {
                          const val = result.crosstab?.[cat]?.[o.id] || 0;
                          const pct = rowTotal > 0 ? (val / rowTotal) * 100 : 0;
                          return (
                            <td key={o.id} className="text-center p-2">
                              <span className="font-medium">{pct.toFixed(1)}%</span>
                              <span className="text-muted-foreground ml-1">({val.toFixed(0)})</span>
                            </td>
                          );
                        })}
                        <td className="text-center p-2 text-muted-foreground">{rowTotal.toFixed(0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!result && !loading && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Selecione uma dimensão demográfica para ver o cruzamento
          </p>
        )}
      </CardContent>
    </Card>
  );
}
