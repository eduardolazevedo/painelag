import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut, BarChart3, MessageSquarePlus, LayoutDashboard } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: "/", label: "Enquetes", icon: BarChart3 },
    { path: "/sugerir", label: "Sugerir Pauta", icon: MessageSquarePlus },
    { path: "/resultados", label: "Resultados", icon: LayoutDashboard },
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <span className="text-xl font-bold font-display text-primary">PainelES</span>
          </button>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={location.pathname === item.path ? "default" : "ghost"}
                size="sm"
                onClick={() => navigate(item.path)}
                className="gap-2"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
