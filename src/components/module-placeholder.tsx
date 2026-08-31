import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MspModule } from "@/config/modules";

export function ModulePlaceholder({ module }: { module: MspModule }) {
  const Icon = module.icon;

  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" />
            </div>
            <div>
              <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
                Módulo {module.code}
              </p>
              <CardTitle>{module.title}</CardTitle>
            </div>
            <Badge variant="secondary" className="ml-auto">
              Em construção
            </Badge>
          </div>
          <CardDescription>{module.description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          Este módulo entra na sequência.
        </CardContent>
      </Card>
    </div>
  );
}
