import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "Política", "Economia", "Saúde", "Educação", "Segurança",
  "Meio Ambiente", "Transporte", "Cultura", "Esporte", "Outro"
];

export default function SuggestTopic() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;
    setSubmitting(true);

    try {
      const { error } = await supabase.from("survey_suggestions").insert({
        user_id: user.id,
        title: title.trim().slice(0, 200),
        description: description.trim().slice(0, 1000) || null,
        category: category || null,
      });

      if (error) throw error;
      toast.success("Sugestão enviada! Obrigado pela contribuição.");
      setTitle("");
      setDescription("");
      setCategory("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar sugestão");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container max-w-xl py-8">
      <Card className="shadow-card border-0">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-secondary/10 flex items-center justify-center">
            <MessageSquarePlus className="h-6 w-6 text-secondary" />
          </div>
          <CardTitle className="text-2xl">Sugerir uma Pauta</CardTitle>
          <CardDescription>
            Que tema você gostaria de ver pesquisado? Sua sugestão pode virar uma enquete!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título da sugestão *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Opinião sobre o transporte público na Grande Vitória"
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Descrição (opcional)</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explique por que esse tema é importante..."
                maxLength={1000}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || !title.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enviar sugestão
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
