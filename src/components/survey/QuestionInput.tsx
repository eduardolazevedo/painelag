import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Question } from "./types";

interface QuestionInputProps {
  question: Question;
  value: any;
  onChange: (val: any) => void;
}

export default function QuestionInput({ question, value, onChange }: QuestionInputProps) {
  switch (question.question_type) {
    case "multiple_choice_single":
      return (
        <RadioGroup value={value || ""} onValueChange={onChange} className="space-y-3">
          {question.options.map((opt) => (
            <div key={opt.id} className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent transition-colors">
              <RadioGroupItem value={opt.id} id={opt.id} />
              <Label htmlFor={opt.id} className="flex-1 cursor-pointer">{opt.option_text}</Label>
            </div>
          ))}
        </RadioGroup>
      );

    case "multiple_choice_multiple": {
      const selected: string[] = value || [];
      return (
        <div className="space-y-3">
          {question.options.map((opt) => (
            <div key={opt.id} className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent transition-colors">
              <Checkbox
                id={opt.id}
                checked={selected.includes(opt.id)}
                onCheckedChange={(checked) => {
                  onChange(checked ? [...selected, opt.id] : selected.filter((s) => s !== opt.id));
                }}
              />
              <Label htmlFor={opt.id} className="flex-1 cursor-pointer">{opt.option_text}</Label>
            </div>
          ))}
        </div>
      );
    }

    case "likert": {
      const likertMax = question.config?.max || 5;
      const likertLabels = question.config?.labels || {};
      return (
        <div className="space-y-4">
          <Slider value={[value ?? Math.ceil(likertMax / 2)]} onValueChange={([v]) => onChange(v)} min={1} max={likertMax} step={1} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{likertLabels.min || "Discordo totalmente"}</span>
            <span className="text-lg font-bold text-primary">{value ?? "—"}</span>
            <span>{likertLabels.max || "Concordo totalmente"}</span>
          </div>
        </div>
      );
    }

    case "nps":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => onChange(i)}
                className={`h-10 rounded-md text-sm font-medium transition-all ${
                  value === i
                    ? "bg-primary text-primary-foreground shadow-md scale-110"
                    : "bg-accent text-accent-foreground hover:bg-primary/10"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Nada provável</span>
            <span>Extremamente provável</span>
          </div>
        </div>
      );

    case "ranking": {
      const items: string[] = value || question.options.map((o) => o.id);
      const optMap = Object.fromEntries(question.options.map((o) => [o.id, o.option_text]));
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-3">Arraste ou use as setas para ordenar por prioridade</p>
          {items.map((itemId, idx) => (
            <div key={itemId} className="flex items-center gap-3 rounded-lg border p-3 bg-card">
              <span className="text-sm font-bold text-primary w-6 text-center">{idx + 1}º</span>
              <span className="flex-1">{optMap[itemId] || itemId}</span>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => {
                    if (idx === 0) return;
                    const newItems = [...items];
                    [newItems[idx - 1], newItems[idx]] = [newItems[idx], newItems[idx - 1]];
                    onChange(newItems);
                  }}
                  disabled={idx === 0}
                  className="text-xs px-1 text-muted-foreground hover:text-primary disabled:opacity-30"
                >▲</button>
                <button
                  onClick={() => {
                    if (idx === items.length - 1) return;
                    const newItems = [...items];
                    [newItems[idx], newItems[idx + 1]] = [newItems[idx + 1], newItems[idx]];
                    onChange(newItems);
                  }}
                  disabled={idx === items.length - 1}
                  className="text-xs px-1 text-muted-foreground hover:text-primary disabled:opacity-30"
                >▼</button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    case "open_text":
      return (
        <Textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Digite sua resposta aqui..."
          className="min-h-[120px]"
          maxLength={2000}
        />
      );

    default:
      return <p className="text-muted-foreground">Tipo de pergunta não suportado.</p>;
  }
}
