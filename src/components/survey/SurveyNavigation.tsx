import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Send, Loader2 } from "lucide-react";

interface SurveyNavigationProps {
  currentIndex: number;
  totalQuestions: number;
  submitting: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

export default function SurveyNavigation({
  currentIndex,
  totalQuestions,
  submitting,
  onPrevious,
  onNext,
  onSubmit,
}: SurveyNavigationProps) {
  const isLast = currentIndex >= totalQuestions - 1;

  return (
    <div className="flex justify-between mt-6">
      <Button
        variant="outline"
        onClick={onPrevious}
        disabled={currentIndex === 0}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" /> Anterior
      </Button>

      {!isLast ? (
        <Button onClick={onNext} className="gap-2">
          Próxima <ArrowRight className="h-4 w-4" />
        </Button>
      ) : (
        <Button onClick={onSubmit} disabled={submitting} className="gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar respostas
        </Button>
      )}
    </div>
  );
}
