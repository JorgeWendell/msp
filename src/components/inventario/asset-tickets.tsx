"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { listTickets } from "@/actions/tickets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatTicketDate,
  openTicketStatuses,
  priorityBadgeClass,
  statusBadgeClass,
  ticketLabel,
  ticketPriorities,
  ticketStatuses,
} from "@/config/tickets";

type TicketRow = {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: string;
  createdAt: Date | string;
};

type TicketFilter = "ativos" | "vencidos" | "concluidos";

const OVERDUE_MS = 48 * 60 * 60 * 1000;

function isOpen(status: string) {
  return (openTicketStatuses as readonly string[]).includes(status);
}

function isOverdue(row: TicketRow) {
  if (!isOpen(row.status)) return false;
  const created = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
  return Date.now() - created.getTime() > OVERDUE_MS;
}

export function AssetTickets({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TicketFilter>("ativos");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listTickets({ clientId });
    setLoading(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    setRows((result.data ?? []) as TicketRow[]);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "ativos") return rows.filter((row) => isOpen(row.status));
    if (filter === "vencidos") return rows.filter(isOverdue);
    return rows.filter((row) => !isOpen(row.status));
  }, [filter, rows]);

  const counts = useMemo(
    () => ({
      ativos: rows.filter((row) => isOpen(row.status)).length,
      vencidos: rows.filter(isOverdue).length,
      concluidos: rows.filter((row) => !isOpen(row.status)).length,
    }),
    [rows]
  );

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Chamados do cliente
        </p>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["ativos", "Ativos"],
              ["vencidos", "Vencidos"],
              ["concluidos", "Concluídos"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="xs"
              variant={filter === value ? "default" : "outline"}
              onClick={() => setFilter(value)}
            >
              {label} ({counts[value]})
            </Button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">ID</th>
              <th className="px-3 py-2.5 font-medium">Título</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Prioridade</th>
              <th className="px-3 py-2.5 font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Carregando chamados...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  {filter === "vencidos"
                    ? "Nenhum chamado aberto há mais de 2 dias."
                    : "Nenhum chamado nesta lista."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2.5">
                    <Link href={`/tickets/${row.id}`} className="hover:underline">
                      {row.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/tickets/${row.id}`} className="hover:underline">
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={statusBadgeClass(row.status)}>
                      {ticketLabel(ticketStatuses, row.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={priorityBadgeClass(row.priority)}>
                      {ticketLabel(ticketPriorities, row.priority)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">{formatTicketDate(row.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
