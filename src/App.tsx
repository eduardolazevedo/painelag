import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import AuthPage from "@/components/AuthPage";
import AppHeader from "@/components/AppHeader";
import Home from "./pages/Home";
import SurveyPage from "./pages/SurveyPage";
import SuggestPage from "./pages/SuggestPage";
import ResultsPage from "./pages/ResultsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-primary font-display">PainelES</h1>
          <div className="h-1 w-24 mx-auto rounded-full gradient-primary animate-pulse-soft" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/enquete/:id" element={<SurveyPage />} />
        <Route path="/sugerir" element={<SuggestPage />} />
        <Route path="/resultados" element={<ResultsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
