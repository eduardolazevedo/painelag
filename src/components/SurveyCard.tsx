import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SurveyCardProps {
  id: string;
  title: string;
  description?: string | null;
  estimatedMinutes?: number;
  tags?: string[];
  responseCount?: number;
  answered?: boolean;
}

export default function SurveyCard({
  id, title, description, estimatedMinutes = 3, tags = [], responseCount = 0, answered = false
}: SurveyCardProps) {
  const navigate = useNavigate();

  return (
    <Card className="shadow-card hover:shadow-elevated transition-all duration-300 group border-0 animate-fade-in">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg leading-snug group-hover:text-primary transition-colors">
            {title}
          </CardTitle>
          {answered && (
            <Badge variant="secondary" className="ml-2 shrink-0 bg-es-success/10 text-es-success border-0">
              Respondida
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {estimatedMinutes} min
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {responseCount.toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            <Button
              size="sm"
              variant={answered ? "outline" : "default"}
              onClick={() => navigate(`/enquete/${id}`)}
              className="gap-1"
            >
              {answered ? "Ver" : "Responder"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
