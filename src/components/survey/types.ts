export interface QuestionOption {
  id: string;
  option_text: string;
  display_order: number;
}

export interface Question {
  id: string;
  question_text: string;
  question_type: string;
  display_order: number;
  is_required: boolean;
  config: any;
  options: QuestionOption[];
}

export interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: string;
  estimated_duration_minutes: number | null;
  minimum_duration_seconds: number | null;
  [key: string]: any;
}
