import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  MonitorOff,
  Ticket,
  UserX,
  type LucideIcon,
} from "lucide-react";

import { getDashboardStats } from "@/actions/dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { erpModules } from "@/config/modules";
import { allowedModuleSlugs, getAccessForSession, homePath } from "@/lib/access";

export const metadata: Metadata = {
  title: "Painel",
};

type Kpi = {
  href: string;
  label: string;
  hint: string;
  value: number | null;
  icon: LucideIcon;
  warn?: boolean;
};

export default async function DashboardPage() {
  const access = await getAccessForSession();
  const allowed = access ? allowedModuleSlugs(access) : [];
  if (access && allowed.length === 1) {
    redirect(homePath(access));
  }
  const visible = erpModules.filter((item) => allowed.includes(item.slug));
  const stats = await getDashboardStats();
  const data = stats.data;

  const kpis: Kpi[] = [
    {
      href: "/tickets?status=aberto",
      label: "Abertos",
      hint: "Tickets no status aberto",
      value: data?.open ?? null,
      icon: Ticket,
    },
    {
      href: "/tickets?priority=critica&queue=aberta",
      label: "Críticos",
      hint: "Prioridade crítica em atendimento",
      value: data?.critical ?? null,
      icon: AlertTriangle,
      warn: true,
    },
    {
      href: "/tickets?unassigned=1&queue=aberta",
      label: "Sem operador",
      hint: "Fila sem atribuição",
      value: data?.unassigned ?? null,
      icon: UserX,
    },
    {
      href: "/inventario?agentStatus=desconhecido",
      label: "Sem agente",
      hint: "Máquinas ainda sem o app",
      value: data?.withoutAgent ?? null,
      icon: MonitorOff,
    },
  ].filter((item) => item.value !== null);

  return (
    <div className="mx-auto grid max-w-7xl gap-8">
      <div>
        <h1 className="font-heading text-2xl tracking-tight">Painel</h1>
        <p className="text-sm text-muted-foreground">
          Contadores da fila e atalhos para o que precisa de atenção.
        </p>
      </div>

      {kpis.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((item) => {
            const Icon = item.icon;
            const alert = item.warn && (item.value ?? 0) > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="overflow-hidden rounded-xl border transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {item.label}
                  </p>
                  <Icon
                    className={
                      alert
                        ? "size-4 text-destructive"
                        : "size-4 text-muted-foreground"
                    }
                  />
                </div>
                <div className="p-4">
                  <p
                    className={
                      alert
                        ? "font-heading text-3xl tracking-tight text-destructive"
                        : "font-heading text-3xl tracking-tight"
                    }
                  >
                    {item.value}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.hint}</p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Atalhos</CardTitle>
          <CardDescription>
            Só aparecem as áreas liberadas para o seu perfil.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.slug}
                href={item.href}
                className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/50"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{item.code}</p>
                  <p className="text-sm font-medium">{item.title}</p>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
