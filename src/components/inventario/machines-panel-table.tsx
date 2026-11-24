"use client";

import { Eye, Loader2, Monitor, Trash2 } from "lucide-react";
import Link from "next/link";

import { AntivirusIcon, OsIcon } from "@/components/inventario/os-antivirus-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  agentStatusBadgeClass,
  agentStatuses,
  assetLabel,
  formatAssetDate,
} from "@/config/inventario";

export type MachineListRow = {
  id: string;
  hostname: string;
  os: string | null;
  ip: string | null;
  active: boolean;
  agentStatus: string;
  lastSeenAt: Date | string | null;
  clientName: string;
  loggedUser?: string | null;
  antivirus?: string | null;
};

export function MachinesPanelTable({
  rows,
  loading,
  empty,
  located,
  deletingId,
  onOpen,
  onConnect,
  onDelete,
}: {
  rows: MachineListRow[];
  loading: boolean;
  empty: string;
  located: (id: string) => boolean;
  deletingId: string | null;
  onOpen: (row: MachineListRow) => void;
  onConnect: (row: MachineListRow) => void;
  onDelete: (row: MachineListRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[1080px] text-sm">
        <thead className="bg-muted/50 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2.5 font-medium">Cliente</th>
            <th className="px-3 py-2.5 font-medium">SO</th>
            <th className="px-3 py-2.5 font-medium">Host</th>
            <th className="px-3 py-2.5 font-medium">Sistema</th>
            <th className="px-3 py-2.5 font-medium">Usuário</th>
            <th className="px-3 py-2.5 font-medium">Status op.</th>
            <th className="px-3 py-2.5 font-medium">Status TI</th>
            <th className="px-3 py-2.5 font-medium">Último contato</th>
            <th className="px-3 py-2.5 font-medium">Antivírus</th>
            <th className="px-3 py-2.5 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td className="px-3 py-8 text-center text-muted-foreground" colSpan={10}>
                Carregando...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td className="px-3 py-8 text-center text-muted-foreground" colSpan={10}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className={
                  located(row.id)
                    ? "border-t bg-sky-500/15 dark:bg-sky-500/20"
                    : "border-t"
                }
              >
                <td className="max-w-[220px] px-3 py-2.5">
                  <p className="truncate font-medium" title={row.clientName}>
                    {row.clientName}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <OsIcon os={row.os} />
                </td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/inventario/${row.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.hostname}
                  </Link>
                  <p className="text-xs text-muted-foreground">{row.ip || "—"}</p>
                </td>
                <td className="px-3 py-2.5">{row.os || "—"}</td>
                <td className="px-3 py-2.5">{row.loggedUser || "—"}</td>
                <td className="px-3 py-2.5">
                  <Badge
                    variant="outline"
                    className={
                      row.active
                        ? "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "text-muted-foreground"
                    }
                  >
                    {row.active ? "Ativo" : "Inativo"}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <Badge
                    variant="outline"
                    className={agentStatusBadgeClass(row.agentStatus)}
                  >
                    {assetLabel(agentStatuses, row.agentStatus)}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                  {formatAssetDate(row.lastSeenAt)}
                </td>
                <td className="px-3 py-2.5">
                  <AntivirusIcon name={row.antivirus} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Conectar em ${row.hostname}`}
                      onClick={() => onConnect(row)}
                    >
                      <Monitor />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Abrir ${row.hostname}`}
                      onClick={() => onOpen(row)}
                    >
                      <Eye />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Excluir ${row.hostname}`}
                      disabled={deletingId === row.id}
                      onClick={() => onDelete(row)}
                    >
                      {deletingId === row.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
