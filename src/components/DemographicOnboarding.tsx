import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { UserCircle, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errorMessages";

const GENDERS = [
  { value: "masculino", label: "Masculino" },
  { value: "feminino", label: "Feminino" },
  { value: "nao_binario", label: "Não-binário" },
  { value: "prefiro_nao_dizer", label: "Prefiro não dizer" },
];

const EDUCATION_LEVELS = [
  { value: "fundamental_incompleto", label: "Fundamental incompleto" },
  { value: "fundamental_completo", label: "Fundamental completo" },
  { value: "medio_incompleto", label: "Médio incompleto" },
  { value: "medio_completo", label: "Médio completo" },
  { value: "superior_incompleto", label: "Superior incompleto" },
  { value: "superior_completo", label: "Superior completo" },
  { value: "pos_graduacao", label: "Pós-graduação" },
];

const INCOME_BRACKETS = [
  { value: "ate_2sm", label: "Até 2 salários mínimos" },
  { value: "2_a_5sm", label: "De 2 a 5 salários mínimos" },
  { value: "5_a_10sm", label: "De 5 a 10 salários mínimos" },
  { value: "10_a_20sm", label: "De 10 a 20 salários mínimos" },
  { value: "acima_20sm", label: "Acima de 20 salários mínimos" },
  { value: "prefiro_nao_dizer", label: "Prefiro não dizer" },
];

const ES_MUNICIPALITIES = [
  "Vitória", "Vila Velha", "Serra", "Cariacica", "Viana",
  "Guarapari", "Cachoeiro de Itapemirim", "Linhares", "Colatina",
  "São Mateus", "Aracruz", "Nova Venécia", "Barra de São Francisco",
  "Alegre", "Castelo", "Domingos Martins", "Afonso Cláudio",
  "Santa Maria de Jetibá", "Itapemirim", "Marataízes",
  "Anchieta", "Piúma", "Iconha", "Rio Novo do Sul",
  "Outro município do ES",
];

interface StepProps {
  onNext: () => void;
  onPrev?: () => void;
}

const STEPS = [
  { title: "Gênero", description: "Como você se identifica?" },
  { title: "Idade", description: "Qual seu ano de nascimento?" },
  { title: "Escolaridade", description: "Qual seu nível de escolaridade?" },
  { title: "Renda", description: "Qual sua faixa de renda familiar?" },
  { title: "Município", description: "Em qual município do ES você mora?" },
];

export default function DemographicOnboarding({ onComplete }: { onComplete: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [gender, setGender] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [education, setEducation] = useState("");
  const [income, setIncome] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const progress = ((step + 1) / STEPS.length) * 100;
  const currentYear = new Date().getFullYear();

  const isStepValid = () => {
    switch (step) {
      case 0: return !!gender;
      case 1: {
        const y = parseInt(birthYear);
        return !isNaN(y) && y >= 1920 && y <= currentYear - 16;
      }
      case 2: return !!education;
      case 3: return !!income;
      case 4: return !!municipality;
      default: return false;
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          gender,
          birth_year: parseInt(birthYear),
          education_level: education,
          income_bracket: income,
          municipality,
          state: "ES",
        })
        .eq("user_id", user.id);

      if (error) throw error;
      toast.success("Perfil completo! Agora você pode participar das enquetes.");
      onComplete();
    } catch (err: any) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold font-display text-primary">PainelES</h1>
          <p className="text-muted-foreground">
            Complete seu perfil para participar das enquetes
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Etapa {step + 1} de {STEPS.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card className="shadow-elevated border-0 animate-fade-in" key={step}>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <UserCircle className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">{STEPS[step].title}</CardTitle>
            <CardDescription>{STEPS[step].description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <div className="space-y-2">
                <Label>Gênero</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2">
                <Label>Ano de nascimento</Label>
                <Input
                  type="number"
                  placeholder="Ex: 1990"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  min={1920}
                  max={currentYear - 16}
                />
                {birthYear && !isNaN(parseInt(birthYear)) && (
                  <p className="text-sm text-muted-foreground">
                    Idade: {currentYear - parseInt(birthYear)} anos
                  </p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2">
                <Label>Escolaridade</Label>
                <Select value={education} onValueChange={setEducation}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {EDUCATION_LEVELS.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-2">
                <Label>Faixa de renda familiar</Label>
                <Select value={income} onValueChange={setIncome}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {INCOME_BRACKETS.map((i) => (
                      <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-2">
                <Label>Município</Label>
                <Select value={municipality} onValueChange={setMunicipality}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {ES_MUNICIPALITIES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                disabled={step === 0}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" /> Anterior
              </Button>
              <Button
                onClick={handleNext}
                disabled={!isStepValid() || submitting}
                className="gap-2"
              >
                {step === STEPS.length - 1 ? (
                  <>
                    {submitting ? "Salvando..." : "Concluir"}
                    <CheckCircle2 className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    Próxima <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          Seus dados demográficos são usados apenas para garantir a representatividade
          estatística das pesquisas. Nunca serão compartilhados individualmente.
        </p>
      </div>
    </div>
  );
}
