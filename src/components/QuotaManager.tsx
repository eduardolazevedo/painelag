import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Target, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

const QUOTA_DIMENSIONS: Record<string, string[]> = {
  gender: ["Masculino", "Feminino"],
  age_group: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
  education_level: ["Fundamental", "Médio", "Superior", "Pós-graduação"],
  income_bracket: ["Até 2 SM", "2-5 SM", "5-10 SM", "Acima de 10 SM"],
};

const DIM_LABELS: Record<string, string> = {
  gender: "Gênero",
  age_group: "Faixa etária",
  education_level: "Escolaridade",
  income_bracket: "Renda",
};

interface Quota {
  id: string;
  dimension: string;
  category: string;
  target_count: number;
  current_count: number;
  is_closed: boolean;
}

export default function QuotaManager({ surveyId }: { surveyId: string }) {
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDim, setAddDim] = useState("");
  const [addCat, setAddCat] = useState("");
  const [addTarget, setAddTarget] = useState("50");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadQuotas();
  }, [surveyId]);

  const loadQuotas = async () => {
    const { data } = await supabase
      .from("survey_quotas")
      .select("*")
      .eq("survey_id", surveyId)
      .order("dimension")
      .order("category");
    setQuotas((data || []) as Quota[]);
    setLoading(false);
  };

  const addQuota = async () => {
    if (!addDim || !addCat || !addTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("survey_quotas").insert({
        survey_id: surveyId,
        dimension: addDim,
        category: addCat,
        target_count: parseInt(addTarget),
      });
      if (error) throw error;
      toast.success("Quota adicionada");
      setAddCat("");
      loadQuotas();
    } catch {
      toast.error("Erro ao adicionar quota");
    } finally {
      setSaving(false);
    }
  };

  const deleteQuota = async (id: string) => {
    await supabase.from("survey_quotas").delete().eq("id", id);
    loadQuotas();
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto my-4" />;

  const grouped = quotas.reduce((acc, q) => {
    (acc[q.dimension] = acc[q.dimension] || []).push(q);
    return acc;
  }, {} as Record<string, Quota[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Quotas demográficas
        </h4>
      </div>

      {Object.entries(grouped).map(([dim, qs]) => (
        <div key={dim} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {DIM_LABELS[dim] || dim}
          </p>
          {qs.map(q => (
            <div key={q.id} className="flex items-center gap-3 text-sm">
              <span className="w-28 truncate">{q.category}</span>
              <Progress
                value={(q.current_count / q.target_count) * 100}
                className="flex-1 h-2"
              />
              <span className="text-xs text-muted-foreground w-16 text-right">
                {q.current_count}/{q.target_count}
              </span>
              {q.is_closed ? (
                <Lock className="h-3.5 w-3.5 text-es-warning" />
              ) : (
                <Unlock className="h-3.5 w-3.5 text-es-success" />
              )}
              <Button size="sm" variant="ghost" onClick={() => deleteQuota(q.id)} className="h-6 w-6 p-0">
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      ))}

      {/* Add quota form */}
      <div className="border-t pt-3 space-y-2">
        <p className="text-xs font-medium">Adicionar quota</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs">Dimensão</Label>
            <Select value={addDim} onValueChange={v => { setAddDim(v); setAddCat(""); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Dimensão" /></SelectTrigger>
              <SelectContent>
                {Object.entries(DIM_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label className="text-xs">Categoria</Label>
            <Select value={addCat} onValueChange={setAddCat} disabled={!addDim}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                {(QUOTA_DIMENSIONS[addDim] || []).map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-20">
            <Label className="text-xs">Meta</Label>
            <Input type="number" value={addTarget} onChange={e => setAddTarget(e.target.value)} className="h-8 text-xs" min={1} />
          </div>
          <Button size="sm" onClick={addQuota} disabled={saving || !addDim || !addCat} className="h-8">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
