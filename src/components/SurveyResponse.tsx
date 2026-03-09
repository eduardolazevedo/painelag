import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2 } from "lucide-react";

import { useSurveyData } from "@/components/survey/useSurveyData";
import { useSubmitSurvey } from "@/components/survey/useSubmitSurvey";
import QuestionInput from "@/components/survey/QuestionInput";
import SurveyNavigation from "@/components/survey/SurveyNavigation";

export default function SurveyResponse() {
  const { id: surveyId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { survey, questions, loading } = useSurveyData(surveyId, () => navigate("/"));
  const { submitting, submit, resetTimer } = useSubmitSurvey();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});

  useEffect(() => {
    if (surveyId) resetTimer();
  }, [surveyId]);

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  const handleSubmit = () => {
    if (!user || !surveyId) return;
    submit({
      surveyId,
      userId: user.id,
      questions,
      answers,
      onSuccess: () => navigate("/"),
      onMissingRequired: (idx) => setCurrentIndex(idx),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!survey || questions.length === 0) {
    return (
      <div className="container max-w-2xl py-12 text-center">
        <p className="text-muted-foreground">Enquete sem perguntas disponíveis.</p>
        <Button variant="ghost" onClick={() => navigate("/")} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <Button variant="ghost" onClick={() => navigate("/")} className="mb-4 gap-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">{survey.title}</h1>
        {survey.description && <p className="text-muted-foreground mt-1">{survey.description}</p>}
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>Pergunta {currentIndex + 1} de {questions.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <Card className="shadow-card border-0 animate-fade-in" key={currentQuestion.id}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold font-body">
            {currentQuestion.question_text}
            {currentQuestion.is_required && <span className="text-secondary ml-1">*</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QuestionInput
            question={currentQuestion}
            value={answers[currentQuestion.id]}
            onChange={(val) => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: val }))}
          />
        </CardContent>
      </Card>

      <SurveyNavigation
        currentIndex={currentIndex}
        totalQuestions={questions.length}
        submitting={submitting}
        onPrevious={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        onNext={() => setCurrentIndex((i) => i + 1)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
