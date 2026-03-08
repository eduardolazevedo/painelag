import { useState } from "react";
import { getErrorMessage } from "@/lib/errorMessages";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Users, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
        toast.success("Bem-vindo de volta!");
      } else {
        await signUp(email, password);
        toast.success("Conta criada! Verifique seu e-mail.");
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'auth'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-hero items-center justify-center p-12">
        <div className="max-w-md text-center space-y-8">
          <h1 className="text-5xl font-bold text-primary-foreground tracking-tight">
            PainelES
          </h1>
          <p className="text-xl text-primary-foreground/80">
            Inteligência de opinião pública para o jornalismo capixaba
          </p>
          <div className="grid grid-cols-3 gap-6 pt-8">
            <div className="flex flex-col items-center gap-2 text-primary-foreground/70">
              <BarChart3 className="h-8 w-8" />
              <span className="text-sm">Enquetes</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-primary-foreground/70">
              <Users className="h-8 w-8" />
              <span className="text-sm">Painel</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-primary-foreground/70">
              <TrendingUp className="h-8 w-8" />
              <span className="text-sm">Análise</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md shadow-elevated border-0">
          <CardHeader className="text-center space-y-2">
            <div className="lg:hidden mb-4">
              <h2 className="text-3xl font-bold text-primary">PainelES</h2>
            </div>
            <CardTitle className="text-2xl">
              {isLogin ? "Entrar" : "Criar conta"}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? "Acesse sua conta para participar das enquetes"
                : "Cadastre-se para fazer parte do painel"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={255}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  maxLength={128}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Aguarde..." : isLogin ? "Entrar" : "Criar conta"}
              </Button>
            </form>
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {isLogin
                  ? "Não tem conta? Cadastre-se"
                  : "Já tem conta? Entre"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
