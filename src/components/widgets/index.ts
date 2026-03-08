/**
 * PainelES Embeddable Widgets
 * 
 * Import these components anywhere in the super app to embed
 * surveys and results inline within content.
 * 
 * @example
 * ```tsx
 * import { SurveyWidget, ResultsWidget } from "@/components/widgets";
 * 
 * // Inline survey
 * <SurveyWidget surveyId="uuid" compact onComplete={() => refetch()} />
 * 
 * // Results summary
 * <ResultsWidget surveyId="uuid" compact />
 * 
 * // Single question result
 * <ResultsWidget surveyId="uuid" questionId="q-uuid" compact />
 * ```
 */
export { default as SurveyWidget } from "./SurveyWidget";
export { default as ResultsWidget } from "./ResultsWidget";
