import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date();

    // Find templates due for generation
    const { data: templates, error: fetchErr } = await supabase
      .from("survey_templates")
      .select("*")
      .eq("is_active", true)
      .neq("recurrence_type", "none")
      .or(`next_generation_at.is.null,next_generation_at.lte.${now.toISOString()}`);

    if (fetchErr) throw fetchErr;
    if (!templates || templates.length === 0) {
      return new Response(JSON.stringify({ message: "No templates due", generated: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let generated = 0;

    for (const template of templates) {
      // Create survey from template
      const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
      const { data: survey, error: surveyErr } = await supabase
        .from("surveys")
        .insert({
          title: `${template.title} — ${dateStr}`,
          description: template.description,
          estimated_duration_minutes: template.estimated_duration_minutes,
          minimum_duration_seconds: template.minimum_duration_seconds,
          tags: template.tags,
          is_public_results: template.is_public_results,
          status: "active",
          created_by: template.created_by,
          starts_at: now.toISOString(),
          ends_at: template.auto_close_after_hours
            ? new Date(now.getTime() + template.auto_close_after_hours * 3600000).toISOString()
            : null,
        })
        .select()
        .single();

      if (surveyErr || !survey) {
        console.error(`Failed to create survey from template ${template.id}:`, surveyErr);
        continue;
      }

      // Copy questions
      const { data: tQuestions } = await supabase
        .from("template_questions")
        .select("*")
        .eq("template_id", template.id)
        .order("display_order");

      if (tQuestions) {
        for (const tq of tQuestions) {
          const { data: newQ } = await supabase
            .from("questions")
            .insert({
              survey_id: survey.id,
              question_text: tq.question_text,
              question_type: tq.question_type,
              display_order: tq.display_order,
              is_required: tq.is_required,
              config: tq.config,
            })
            .select()
            .single();

          if (newQ) {
            // Copy options
            const { data: tOpts } = await supabase
              .from("template_question_options")
              .select("*")
              .eq("question_id", tq.id)
              .order("display_order");

            if (tOpts && tOpts.length > 0) {
              await supabase.from("question_options").insert(
                tOpts.map((o) => ({
                  question_id: newQ.id,
                  option_text: o.option_text,
                  display_order: o.display_order,
                  value: o.value,
                }))
              );
            }
          }
        }
      }

      // Calculate next generation date
      const nextGen = calculateNextGeneration(template, now);
      await supabase
        .from("survey_templates")
        .update({
          last_generated_at: now.toISOString(),
          next_generation_at: nextGen?.toISOString() || null,
        })
        .eq("id", template.id);

      generated++;
    }

    return new Response(JSON.stringify({ message: "OK", generated }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

function calculateNextGeneration(template: any, from: Date): Date | null {
  const next = new Date(from);
  switch (template.recurrence_type) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      if (template.recurrence_day_of_month) {
        next.setDate(Math.min(template.recurrence_day_of_month, 28));
      }
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      if (template.recurrence_day_of_month) {
        next.setDate(Math.min(template.recurrence_day_of_month, 28));
      }
      break;
    default:
      return null;
  }
  return next;
}
