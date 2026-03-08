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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Trash2, Loader2, Edit, Eye, Lock, Unlock, GripVertical,
  BarChart3, Users, AlertTriangle, Settings
} from "lucide-react";
import { toast } from "sonner";
import QuotaManager from "@/components/QuotaManager";

type QuestionType = "multiple_choice_single" | "multiple_choice_multiple" | "likert" | "nps" | "ranking" | "open_text";
type SurveyStatus = "draft" | "active" | "closed" | "archived";

interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  estimated_duration_minutes: number | null;
  minimum_duration_seconds: number | null;
  is_public_results: boolean;
  tags: string[];
  created_at: string;
}

interface Question {
  id: string;
  question_text: string;
  question_type: QuestionType;
  display_order: number;
  is_required: boolean;
  config: any;
  options: { id: string; option_text: string; display_order: number; value: string | null }[];
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice_single: "Múltipla escolha (única)",
  multiple_choice_multiple: "Múltipla escolha (várias)",
  likert: "Escala Likert",
  nps: "NPS (0-10)",
  ranking: "Ranking",
  open_text: "Texto aberto",
};

const STATUS_LABELS: Record<SurveyStatus, string> = {
  draft: "Rascunho",
  active: "Ativa",
  closed: "Encerrada",
  archived: "Arquivada",
};

export default function AdminSurveyManager() {
  const { user } = useAuth();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, [user]);

  const checkAdmin = async () => {
    if (!user) return;
    const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: editorData } = await supabase.rpc("has_role", { _user_id: user.id, _role: "editor" });
    setIsAdmin(!!data || !!editorData);
    if (data || editorData) loadSurveys();
    else setLoading(false);
  };

  const loadSurveys = async () => {
    const { data } = await supabase
      .from("surveys")
      .select("*")
      .order("created_at", { ascending: false });
    setSurveys((data || []) as Survey[]);
    setLoading(false);
  };

  const loadQuestions = async (surveyId: string) => {
    const { data: qs } = await supabase
      .from("questions")
      .select("*")
      .eq("survey_id", surveyId)
      .order("display_order");

    if (!qs) return;

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
  };

  const selectSurvey = (survey: Survey) => {
    setSelectedSurvey(survey);
    loadQuestions(survey.id);
  };

  const updateStatus = async (survey: Survey, newStatus: SurveyStatus) => {
    const { error } = await supabase
      .from("surveys")
      .update({ status: newStatus })
      .eq("id", survey.id);
    if (error) {
      toast.error(getErrorMessage(error));
    } else {
      toast.success(`Status alterado para ${STATUS_LABELS[newStatus]}`);
      loadSurveys();
      if (selectedSurvey?.id === survey.id) {
        setSelectedSurvey({ ...survey, status: newStatus });
      }
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
          <h1 className="text-2xl font-bold font-display">Gerenciar Enquetes</h1>
          <p className="text-muted-foreground text-sm">Crie, edite e gerencie todas as enquetes</p>
        </div>
        <CreateSurveyDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onCreated={() => { loadSurveys(); setShowCreateDialog(false); }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Survey list */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Enquetes ({surveys.length})</h3>
          {surveys.map(survey => (
            <Card
              key={survey.id}
              className={`cursor-pointer border transition-all hover:shadow-card ${
                selectedSurvey?.id === survey.id ? "border-primary shadow-card" : "border-transparent"
              }`}
              onClick={() => selectSurvey(survey)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{survey.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(survey.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <StatusBadge status={survey.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Survey detail */}
        <div className="lg:col-span-2">
          {selectedSurvey ? (
            <SurveyDetail
              survey={selectedSurvey}
              questions={questions}
              onStatusChange={updateStatus}
              onQuestionsChange={() => loadQuestions(selectedSurvey.id)}
              onSurveyUpdate={loadSurveys}
            />
          ) : (
            <Card className="border-0 shadow-card text-center py-12">
              <CardContent>
                <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Selecione uma enquete para gerenciar</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SurveyStatus }) {
  const variants: Record<SurveyStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    active: "bg-es-success/10 text-es-success",
    closed: "bg-es-warning/10 text-es-warning",
    archived: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${variants[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function CreateSurveyDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("3");
  const [minDuration, setMinDuration] = useState("30");
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("surveys").insert({
        title: title.trim(),
        description: description.trim() || null,
        estimated_duration_minutes: parseInt(duration) || 3,
        minimum_duration_seconds: parseInt(minDuration) || 30,
        status: "draft" as any,
      });
      if (error) throw error;
      toast.success("Enquete criada!");
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
        <Button className="gap-2"><Plus className="h-4 w-4" /> Nova enquete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar nova enquete</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da enquete" />
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
          <Button onClick={handleCreate} disabled={submitting || !title.trim()} className="w-full">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Criar enquete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SurveyDetail({ survey, questions, onStatusChange, onQuestionsChange, onSurveyUpdate }: {
  survey: Survey;
  questions: Question[];
  onStatusChange: (s: Survey, status: SurveyStatus) => void;
  onQuestionsChange: () => void;
  onSurveyUpdate: () => void;
}) {
  const isDraft = survey.status === "draft";
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
      const { data: q, error } = await supabase.from("questions").insert({
        survey_id: survey.id,
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
          const { error: optError } = await supabase.from("question_options").insert(opts);
          if (optError) throw optError;
        }
      }

      toast.success("Pergunta adicionada!");
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
      await supabase.from("question_options").delete().eq("question_id", qId);
      const { error } = await supabase.from("questions").delete().eq("id", qId);
      if (error) throw error;
      toast.success("Pergunta removida");
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
            <CardTitle className="text-xl">{survey.title}</CardTitle>
            {survey.description && (
              <CardDescription className="mt-1">{survey.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isDraft && (
              <Button size="sm" onClick={() => onStatusChange(survey, "active")} className="gap-1">
                <Unlock className="h-3.5 w-3.5" /> Publicar
              </Button>
            )}
            {survey.status === "active" && (
              <Button size="sm" variant="outline" onClick={() => onStatusChange(survey, "closed")} className="gap-1">
                <Lock className="h-3.5 w-3.5" /> Encerrar
              </Button>
            )}
            {survey.status === "closed" && (
              <Button size="sm" variant="ghost" onClick={() => onStatusChange(survey, "archived")}>
                Arquivar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <StatusBadge status={survey.status} />
          <span>⏱ {survey.estimated_duration_minutes || 3} min</span>
          <span>⏳ Mín. {survey.minimum_duration_seconds || 0}s</span>
          {!isDraft && (
            <span className="flex items-center gap-1">
              <Lock className="h-3 w-3" /> Perguntas bloqueadas
            </span>
          )}
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Perguntas ({questions.length})</h3>
            {isDraft && (
              <Button size="sm" variant="outline" onClick={() => setAddingQuestion(true)} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            )}
          </div>

          {questions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma pergunta ainda. {isDraft ? "Adicione perguntas para começar." : ""}
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
                {isDraft && (
                  <Button size="sm" variant="ghost" onClick={() => deleteQuestion(q.id)} className="text-destructive shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Add question form */}
        {addingQuestion && isDraft && (
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

        {/* Quota management */}
        <div className="border-t pt-4">
          <QuotaManager surveyId={survey.id} />
        </div>
      </CardContent>
    </Card>
  );
}
