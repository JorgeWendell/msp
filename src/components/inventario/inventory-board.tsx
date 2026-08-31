"use client";

import { EllipsisVertical, Loader2, Monitor, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { deleteAsset, listAssets, listInventoryClients, saveAsset, connectMeshSession } from "@/actions/inventario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  agentStatusBadgeClass,
  agentStatuses,
  assetKinds,
  assetLabel,
} from "@/config/inventario";
type AssetRow = {
  id: string;
  hostname: string;
  serial: string | null;
  kind: string;
  os: string | null;
  ip: string | null;
  mac: string | null;
  location: string | null;
  active: boolean;
  agentStatus: string;
  lastSeenAt: Date | string | null;
  meshNodeId?: string | null;
  clientName: string;
};

type ClientOption = { id: string; name: string; active: boolean; code?: string | null };

const emptyForm = {
  clientId: "",
  hostname: "",
  serial: "",
  kind: "desktop",
  os: "",
  ip: "",
  mac: "",
  location: "",
  notes: "",
};

function locateScore(row: AssetRow, query: string) {
  if (!query) return 0;
  const fields = [
    row.hostname,
    row.serial,
    row.ip,
    row.mac,
    row.location,
    row.os,
    row.clientName,
  ];
  let best = 0;
  for (const field of fields) {
    const value = field?.toLowerCase().trim();
    if (!value) continue;
    if (value === query) best = Math.max(best, 3);
    else if (value.startsWith(query)) best = Math.max(best, 2);
    else if (value.includes(query)) best = Math.max(best, 1);
  }
  return best;
}

export function InventoryBoard({
  initialAgentStatus = "",
}: {
  initialAgentStatus?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [kind, setKind] = useState("");
  const [agentStatus, setAgentStatus] = useState(initialAgentStatus);
  const [locate, setLocate] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const locateQuery = locate.trim().toLowerCase();

  const displayed = useMemo(() => {
    if (!locateQuery) return rows;
    return [...rows].sort(
      (a, b) => locateScore(b, locateQuery) - locateScore(a, locateQuery)
    );
  }, [rows, locateQuery]);

  const locatedCount = locateQuery
    ? displayed.filter((row) => locateScore(row, locateQuery) > 0).length
    : 0;

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listAssets({
      clientId: clientId || undefined,
      kind: kind || undefined,
      agentStatus: agentStatus || undefined,
    });
    setLoading(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    setRows((result.data as AssetRow[]) ?? []);
  }, [clientId, kind, agentStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listInventoryClients().then((result) => {
      if (result.serverError || !result.data) return;
      setClients(result.data);
    });
  }, []);

  function openCreate() {
    setForm(emptyForm);
    setOpen(true);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await saveAsset({
      clientId: form.clientId,
      hostname: form.hostname,
      serial: form.serial || undefined,
      kind: form.kind,
      os: form.os || undefined,
      ip: form.ip || undefined,
      mac: form.mac || undefined,
      location: form.location || undefined,
      notes: form.notes || undefined,
    });
    setSaving(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Máquina cadastrada. O token do agente já está pronto.");
    setOpen(false);
    if (result.data?.id) {
      router.push(`/inventario/${result.data.id}`);
      return;
    }
    await load();
  }

  async function handleConnect(row: AssetRow) {
    const result = await connectMeshSession({ id: row.id });
    if (result.serverError || !result.data?.url) {
      toast.error(result.serverError || "Não foi possível abrir o remoto.");
      return;
    }
    window.open(`/inventario/${row.id}/remoto`, "_blank", "noopener,noreferrer");
  }

  async function handleDelete(row: AssetRow) {
    if (!confirm(`Excluir a máquina ${row.hostname}?`)) return;
    setDeletingId(row.id);
    const result = await deleteAsset({ id: row.id });
    setDeletingId(null);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Máquina excluída.");
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-tight">Inventário</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre a máquina pelo cliente. O app instalado entra depois, com o
            token já gerado.
          </p>
        </div>
        <Button className="h-9 px-3" onClick={openCreate}>
          <Plus />
          Novo
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            value={locate}
            placeholder="Localizar hostname, serial, IP ou MAC..."
            onChange={(event) => setLocate(event.target.value)}
          />
        </div>
        <NativeSelect
          className="h-9 min-w-52"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
        >
          <option value="">Todos os clientes</option>
          {clients.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-44"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="">Todos os tipos</option>
          {assetKinds.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-44"
          value={agentStatus}
          onChange={(event) => setAgentStatus(event.target.value)}
        >
          <option value="">Todo o agente</option>
          {agentStatuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {locateQuery ? (
        <p className="text-xs text-muted-foreground">
          {locatedCount === 0
            ? "Nenhum dispositivo localizado."
            : locatedCount === 1
              ? "1 dispositivo localizado na primeira linha."
              : `${locatedCount} dispositivos localizados no topo da lista.`}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Hostname</th>
              <th className="px-3 py-2.5 font-medium">Cliente</th>
              <th className="px-3 py-2.5 font-medium">Tipo</th>
              <th className="px-3 py-2.5 font-medium">SO</th>
              <th className="px-3 py-2.5 font-medium">IP</th>
              <th className="px-3 py-2.5 font-medium">Agente</th>
              <th className="px-3 py-2.5 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>
                  Carregando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>
                  Nenhuma máquina ainda.
                </td>
              </tr>
            ) : (
              displayed.map((row) => {
                const located = locateScore(row, locateQuery) > 0;
                return (
                <tr
                  key={row.id}
                  className={
                    located
                      ? "border-t bg-sky-500/15 dark:bg-sky-500/20"
                      : "border-t"
                  }
                >
                  <td className="px-3 py-2.5">
                    <Link href={`/inventario/${row.id}`} className="font-medium hover:underline">
                      {row.hostname}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {row.serial || "Sem serial"}
                      {!row.active ? " · Inativa" : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">{row.clientName}</td>
                  <td className="px-3 py-2.5">{assetLabel(assetKinds, row.kind)}</td>
                  <td className="px-3 py-2.5">{row.os || "—"}</td>
                  <td className="px-3 py-2.5">{row.ip || "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={agentStatusBadgeClass(row.agentStatus)}
                    >
                      {assetLabel(agentStatuses, row.agentStatus)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            aria-label={`Ações de ${row.hostname}`}
                          />
                        }
                      >
                        <EllipsisVertical />
                        Ações
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-40">
                        <DropdownMenuItem
                          onClick={() => router.push(`/inventario/${row.id}`)}
                        >
                          <Pencil />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void handleConnect(row)}>
                          <Monitor />
                          Conectar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={deletingId === row.id}
                          onClick={() => void handleDelete(row)}
                        >
                          {deletingId === row.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Trash2 />
                          )}
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova máquina</DialogTitle>
            <DialogDescription>
              O cadastro já gera o token para o agente reportar status depois.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4">
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="asset-client">Cliente</FieldLabel>
                <NativeSelect
                  id="asset-client"
                  className="h-9"
                  required
                  value={form.clientId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      clientId: event.target.value,
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  {clients
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="asset-kind">Tipo</FieldLabel>
                <NativeSelect
                  id="asset-kind"
                  className="h-9"
                  value={form.kind}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      kind: event.target.value,
                    }))
                  }
                >
                  {assetKinds.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="asset-hostname">Hostname</FieldLabel>
                <Input
                  id="asset-hostname"
                  className="h-9"
                  required
                  value={form.hostname}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      hostname: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="asset-serial">Serial</FieldLabel>
                <Input
                  id="asset-serial"
                  className="h-9"
                  value={form.serial}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      serial: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="asset-os">Sistema operacional</FieldLabel>
                <Input
                  id="asset-os"
                  className="h-9"
                  placeholder="Windows 11, Ubuntu 24.04..."
                  value={form.os}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, os: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="asset-ip">IP</FieldLabel>
                <Input
                  id="asset-ip"
                  className="h-9"
                  value={form.ip}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ip: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="asset-mac">MAC</FieldLabel>
                <Input
                  id="asset-mac"
                  className="h-9"
                  value={form.mac}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, mac: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="asset-location">Local</FieldLabel>
                <Input
                  id="asset-location"
                  className="h-9"
                  placeholder="Sala, rack, filial..."
                  value={form.location}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="asset-notes">Observações</FieldLabel>
                <textarea
                  id="asset-notes"
                  className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={saving} className="h-9 px-4">
                {saving ? <Loader2 className="animate-spin" /> : null}
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
