import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errorMessages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Plus, Trash2, Loader2, Play, Pause, Clock, CalendarClock,
  Copy, RefreshCw, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";

type QuestionType = "multiple_choice_single" | "multiple_choice_multiple" | "likert" | "nps" | "ranking" | "open_text";

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice_single: "Múltipla escolha (única)",
  multiple_choice_multiple: "Múltipla escolha (várias)",
  likert: "Escala Likert",
  nps: "NPS (0-10)",
  ranking: "Ranking",
  open_text: "Texto aberto",
};

const RECURRENCE_LABELS: Record<string, string> = {
  none: "Sem recorrência",
  daily: "Diária",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
};

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface Template {
  id: string;
  title: string;
  description: string | null;
  estimated_duration_minutes: number | null;
  minimum_duration_seconds: number | null;
  tags: string[];
  is_public_results: boolean;
  recurrence_type: string;
  recurrence_day_of_week: number | null;
  recurrence_day_of_month: number | null;
  auto_close_after_hours: number | null;
  is_active: boolean;
  last_generated_at: string | null;
  next_generation_at: string | null;
  created_at: string;
}

interface TemplateQuestion {
  id: string;
  question_text: string;
  question_type: QuestionType;
  display_order: number;
  is_required: boolean;
  config: any;
  options: { id: string; option_text: string; display_order: number; value: string | null }[];
}

export default function TemplateManager() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [questions, setQuestions] = useState<TemplateQuestion[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, [user]);

  const checkAdmin = async () => {
    if (!user) return;
    const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: editorData } = await supabase.rpc("has_role", { _user_id: user.id, _role: "editor" });
    setIsAdmin(!!data || !!editorData);
    if (data || editorData) loadTemplates();
    else setLoading(false);
  };

  const loadTemplates = async () => {
    const { data } = await supabase
      .from("survey_templates")
      .select("*")
      .order("created_at", { ascending: false });
    setTemplates((data || []) as Template[]);
    setLoading(false);
  };

  const loadQuestions = async (templateId: string) => {
    const { data: qs } = await supabase
      .from("template_questions")
      .select("*")
      .eq("template_id", templateId)
      .order("display_order");

    if (!qs) return;

    const qIds = qs.map((q: any) => q.id);
    const { data: opts } = qIds.length > 0
      ? await supabase
          .from("template_question_options")
          .select("*")
          .in("question_id", qIds)
          .order("display_order")
      : { data: [] };

    setQuestions(qs.map((q: any) => ({
      ...q,
      options: (opts || []).filter((o: any) => o.question_id === q.id),
    })) as TemplateQuestion[]);
  };

  const selectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    loadQuestions(template.id);
  };

  const toggleActive = async (template: Template) => {
    const { error } = await supabase
      .from("survey_templates")
      .update({ is_active: !template.is_active })
      .eq("id", template.id);
    if (error) toast.error(getErrorMessage(error));
    else {
      toast.success(template.is_active ? "Template desativado" : "Template ativado");
      loadTemplates();
      if (selectedTemplate?.id === template.id) {
        setSelectedTemplate({ ...template, is_active: !template.is_active });
      }
    }
  };

  const generateNow = async (template: Template) => {
    try {
      const { data, error } = await supabase.functions.invoke("generate-scheduled-surveys");
      if (error) throw error;
      toast.success("Enquete gerada com sucesso a partir do template!");
      loadTemplates();
    } catch (err: any) {
      toast.error(getErrorMessage(err));
    }
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("survey_templates").delete().eq("id", id);
    if (error) toast.error(getErrorMessage(error));
    else {
      toast.success("Template excluído");
      setSelectedTemplate(null);
      loadTemplates();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container max-w-2xl py-12 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Acesso restrito</h2>
        <p className="text-muted-foreground">
          Apenas administradores e editores podem acessar esta área.
        </p>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Templates de Enquete</h1>
          <p className="text-muted-foreground text-sm">
            Crie modelos reutilizáveis com geração automática recorrente
          </p>
        </div>
        <CreateTemplateDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onCreated={() => { loadTemplates(); setShowCreateDialog(false); }}
          userId={user?.id}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template list */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Templates ({templates.length})</h3>
          {templates.length === 0 && (
            <Card className="border-dashed border-2">
              <CardContent className="py-8 text-center">
                <CalendarClock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum template criado ainda</p>
              </CardContent>
            </Card>
          )}
          {templates.map(t => (
            <Card
              key={t.id}
              className={`cursor-pointer border transition-all hover:shadow-card ${
                selectedTemplate?.id === t.id ? "border-primary shadow-card" : "border-transparent"
              }`}
              onClick={() => selectTemplate(t)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{t.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs gap-1">
                        <Clock className="h-3 w-3" />
                        {RECURRENCE_LABELS[t.recurrence_type]}
                      </Badge>
                    </div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${
                    t.is_active ? "bg-es-success" : "bg-muted-foreground"
                  }`} />
                </div>
                {t.next_generation_at && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Próxima: {new Date(t.next_generation_at).toLocaleDateString("pt-BR", {
                      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                    })}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Template detail */}
        <div className="lg:col-span-2">
          {selectedTemplate ? (
            <TemplateDetail
              template={selectedTemplate}
              questions={questions}
              onToggleActive={toggleActive}
              onGenerateNow={generateNow}
              onDelete={deleteTemplate}
              onQuestionsChange={() => loadQuestions(selectedTemplate.id)}
            />
          ) : (
            <Card className="border-0 shadow-card text-center py-12">
              <CardContent>
                <CalendarClock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Selecione um template para gerenciar</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────── Create Template Dialog ──────── */
function CreateTemplateDialog({ open, onOpenChange, onCreated, userId }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  userId?: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("3");
  const [minDuration, setMinDuration] = useState("30");
  const [recurrenceType, setRecurrenceType] = useState("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [autoCloseHours, setAutoCloseHours] = useState("168");
  const [submitting, setSubmitting] = useState(false);

  const needsDayOfWeek = ["weekly", "biweekly"].includes(recurrenceType);
  const needsDayOfMonth = ["monthly", "quarterly"].includes(recurrenceType);

  const calculateNextGeneration = () => {
    const now = new Date();
    const next = new Date(now);
    switch (recurrenceType) {
      case "daily": next.setDate(next.getDate() + 1); break;
      case "weekly":
      case "biweekly": {
        const targetDay = parseInt(dayOfWeek);
        const daysUntil = (targetDay - now.getDay() + 7) % 7 || (recurrenceType === "biweekly" ? 14 : 7);
        next.setDate(next.getDate() + daysUntil);
        break;
      }
      case "monthly":
      case "quarterly": {
        const monthsToAdd = recurrenceType === "quarterly" ? 3 : 1;
        next.setMonth(next.getMonth() + monthsToAdd);
        next.setDate(Math.min(parseInt(dayOfMonth), 28));
        break;
      }
    }
    return next;
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const nextGen = recurrenceType !== "none" ? calculateNextGeneration() : null;
      const { error } = await supabase.from("survey_templates").insert({
        title: title.trim(),
        description: description.trim() || null,
        estimated_duration_minutes: parseInt(duration) || 3,
        minimum_duration_seconds: parseInt(minDuration) || 30,
        recurrence_type: recurrenceType,
        recurrence_day_of_week: needsDayOfWeek ? parseInt(dayOfWeek) : null,
        recurrence_day_of_month: needsDayOfMonth ? parseInt(dayOfMonth) : null,
        auto_close_after_hours: parseInt(autoCloseHours) || 168,
        next_generation_at: nextGen?.toISOString() || null,
        created_by: userId,
      });
      if (error) throw error;
      toast.success("Template criado! Adicione perguntas para completá-lo.");
      setTitle(""); setDescription("");
      onCreated();
    } catch (err: any) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Novo template</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar template de enquete</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Pesquisa semanal de satisfação" />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descreva o objetivo..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duração estimada (min)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} min={1} />
            </div>
            <div className="space-y-2">
              <Label>Tempo mínimo (seg)</Label>
              <Input type="number" value={minDuration} onChange={e => setMinDuration(e.target.value)} min={0} />
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" /> Recorrência
            </h4>
            <Select value={recurrenceType} onValueChange={setRecurrenceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RECURRENCE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {needsDayOfWeek && (
              <div className="space-y-2">
                <Label className="text-xs">Dia da semana</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_LABELS.map((label, i) => (
                      <SelectItem key={i} value={String(i)}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsDayOfMonth && (
              <div className="space-y-2">
                <Label className="text-xs">Dia do mês</Label>
                <Input type="number" value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)} min={1} max={28} />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Encerrar automaticamente após (horas)</Label>
              <Input type="number" value={autoCloseHours} onChange={e => setAutoCloseHours(e.target.value)} min={1} />
              <p className="text-xs text-muted-foreground">
                168h = 7 dias | 72h = 3 dias | 24h = 1 dia
              </p>
            </div>
          </div>

          <Button onClick={handleCreate} disabled={submitting || !title.trim()} className="w-full">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Criar template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ──────── Template Detail ──────── */
function TemplateDetail({ template, questions, onToggleActive, onGenerateNow, onDelete, onQuestionsChange }: {
  template: Template;
  questions: TemplateQuestion[];
  onToggleActive: (t: Template) => void;
  onGenerateNow: (t: Template) => void;
  onDelete: (id: string) => void;
  onQuestionsChange: () => void;
}) {
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [newQText, setNewQText] = useState("");
  const [newQType, setNewQType] = useState<QuestionType>("multiple_choice_single");
  const [newQRequired, setNewQRequired] = useState(true);
  const [newOptions, setNewOptions] = useState<string[]>(["", ""]);
  const [saving, setSaving] = useState(false);

  const needsOptions = ["multiple_choice_single", "multiple_choice_multiple", "ranking"].includes(newQType);

  const addQuestion = async () => {
    if (!newQText.trim()) return;
    setSaving(true);
    try {
      const { data: q, error } = await supabase.from("template_questions").insert({
        template_id: template.id,
        question_text: newQText.trim(),
        question_type: newQType,
        display_order: questions.length + 1,
        is_required: newQRequired,
        config: newQType === "likert" ? { max: 5, labels: { min: "Discordo totalmente", max: "Concordo totalmente" } } : {},
      }).select().single();
      if (error) throw error;

      if (needsOptions && q) {
        const opts = newOptions.filter(o => o.trim()).map((o, i) => ({
          question_id: q.id,
          option_text: o.trim(),
          display_order: i + 1,
          value: o.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 50),
        }));
        if (opts.length > 0) {
          const { error: optError } = await supabase.from("template_question_options").insert(opts);
          if (optError) throw optError;
        }
      }

      toast.success("Pergunta adicionada ao template!");
      setNewQText(""); setNewOptions(["", ""]); setAddingQuestion(false);
      onQuestionsChange();
    } catch (err: any) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteQuestion = async (qId: string) => {
    try {
      await supabase.from("template_question_options").delete().eq("question_id", qId);
      const { error } = await supabase.from("template_questions").delete().eq("id", qId);
      if (error) throw error;
      toast.success("Pergunta removida do template");
      onQuestionsChange();
    } catch (err: any) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{template.title}</CardTitle>
            {template.description && (
              <CardDescription className="mt-1">{template.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onGenerateNow(template)}
              className="gap-1"
            >
              <Play className="h-3.5 w-3.5" /> Gerar agora
            </Button>
            <Button
              size="sm"
              variant={template.is_active ? "outline" : "default"}
              onClick={() => onToggleActive(template)}
              className="gap-1"
            >
              {template.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {template.is_active ? "Desativar" : "Ativar"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info row */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Badge variant="outline" className="gap-1">
            <RefreshCw className="h-3 w-3" />
            {RECURRENCE_LABELS[template.recurrence_type]}
          </Badge>
          <span>⏱ {template.estimated_duration_minutes || 3} min</span>
          <span>🔒 Encerra em {template.auto_close_after_hours || 168}h</span>
          {template.recurrence_day_of_week !== null && (
            <span>📅 {WEEKDAY_LABELS[template.recurrence_day_of_week]}</span>
          )}
          {template.recurrence_day_of_month !== null && (
            <span>📅 Dia {template.recurrence_day_of_month}</span>
          )}
        </div>

        {/* Timeline info */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
          {template.last_generated_at && (
            <div>
              <span className="font-medium">Última geração:</span>{" "}
              {new Date(template.last_generated_at).toLocaleDateString("pt-BR", {
                day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
              })}
            </div>
          )}
          {template.next_generation_at && (
            <div>
              <span className="font-medium">Próxima geração:</span>{" "}
              {new Date(template.next_generation_at).toLocaleDateString("pt-BR", {
                day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
              })}
            </div>
          )}
        </div>

        {/* Questions */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Perguntas do template ({questions.length})</h3>
            <Button size="sm" variant="outline" onClick={() => setAddingQuestion(true)} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </Button>
          </div>

          {questions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma pergunta. Adicione perguntas ao template.
            </p>
          )}

          <div className="space-y-2">
            {questions.map((q, i) => (
              <div key={q.id} className="flex items-start gap-3 rounded-lg border p-3 bg-card">
                <span className="text-xs font-bold text-primary mt-1 w-6 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{q.question_text}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {QUESTION_TYPE_LABELS[q.question_type]}
                    </Badge>
                    {q.is_required && (
                      <span className="text-xs text-secondary">Obrigatória</span>
                    )}
                  </div>
                  {q.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {q.options.map(o => (
                        <span key={o.id} className="text-xs bg-muted px-2 py-0.5 rounded">
                          {o.option_text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteQuestion(q.id)} className="text-destructive shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Add question form */}
        {addingQuestion && (
          <div className="border-t pt-4 space-y-4">
            <h4 className="text-sm font-medium">Nova pergunta</h4>
            <div className="space-y-3">
              <Input
                value={newQText}
                onChange={e => setNewQText(e.target.value)}
                placeholder="Texto da pergunta"
              />
              <div className="grid grid-cols-2 gap-3">
                <Select value={newQType} onValueChange={v => setNewQType(v as QuestionType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(QUESTION_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Switch checked={newQRequired} onCheckedChange={setNewQRequired} />
                  <Label className="text-sm">Obrigatória</Label>
                </div>
              </div>

              {needsOptions && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Opções de resposta</Label>
                  {newOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={opt}
                        onChange={e => {
                          const copy = [...newOptions];
                          copy[i] = e.target.value;
                          setNewOptions(copy);
                        }}
                        placeholder={`Opção ${i + 1}`}
                        className="text-sm"
                      />
                      {newOptions.length > 2 && (
                        <Button size="sm" variant="ghost" onClick={() => setNewOptions(newOptions.filter((_, j) => j !== i))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setNewOptions([...newOptions, ""])} className="text-xs">
                    + Adicionar opção
                  </Button>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={addQuestion} disabled={saving || !newQText.trim()} className="gap-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Salvar pergunta
                </Button>
                <Button variant="ghost" onClick={() => setAddingQuestion(false)}>Cancelar</Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete template */}
        <div className="border-t pt-4 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive gap-1"
            onClick={() => {
              if (confirm("Excluir este template permanentemente?")) {
                onDelete(template.id);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir template
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
