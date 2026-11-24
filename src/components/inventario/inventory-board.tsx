"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, EllipsisVertical, Loader2, Monitor, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { deleteAsset, listAssets, listInventoryClients, saveAsset } from "@/actions/inventario";
import { MachinesPanelTable } from "@/components/inventario/machines-panel-table";
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
  composePrinterNotes,
  getInventoryGroup,
  networkHostnames,
  SHOW_MACHINES_PANEL_LIST,
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
  loggedUser?: string | null;
  antivirus?: string | null;
};

type ClientOption = { id: string; name: string; active: boolean; code?: string | null };

const PAGE_SIZE = 9;

const emptyForm = {
  clientId: "",
  hostname: "",
  serial: "",
  kind: "desktop" as string,
  os: "",
  ip: "",
  mac: "",
  location: "",
  notes: "",
  toner: "",
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
    row.loggedUser,
    row.antivirus,
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

type SortKey = "hostname" | "clientName" | "kind" | "os" | "ip" | "agentStatus";

function sortValue(row: AssetRow, key: SortKey) {
  if (key === "kind") return assetLabel(assetKinds, row.kind);
  if (key === "agentStatus") return assetLabel(agentStatuses, row.agentStatus);
  return row[key] ?? "";
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey | null;
  sortDir: "asc" | "desc";
  onSort: (column: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th className="px-3 py-2.5 font-medium">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : null}
      </button>
    </th>
  );
}

export function InventoryBoard({
  initialAgentStatus = "",
  grupo,
}: {
  initialAgentStatus?: string;
  grupo?: string;
}) {
  const router = useRouter();
  const group = getInventoryGroup(grupo);
  const isPrinters = group.slug === "impressoras";
  const isNetwork = group.slug === "rede";
  const showMachinesPanel =
    SHOW_MACHINES_PANEL_LIST && !isPrinters && !isNetwork;
  const groupKinds = assetKinds.filter((item) =>
    (group.kinds as readonly string[]).includes(item.value)
  );
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [restrictedToClientId, setRestrictedToClientId] = useState<string | null>(
    null
  );
  const [clientId, setClientId] = useState("");
  const [locate, setLocate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<typeof emptyForm>({
    ...emptyForm,
    kind: group.defaultKind,
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const locateQuery = locate.trim().toLowerCase();

  const displayed = useMemo(() => {
    const filtered = initialAgentStatus
      ? rows.filter((row) => row.agentStatus === initialAgentStatus)
      : rows;
    return [...filtered].sort((a, b) => {
      if (locateQuery) {
        const located = locateScore(b, locateQuery) - locateScore(a, locateQuery);
        if (located) return located;
      }
      if (!sortKey) return 0;
      const left = String(sortValue(a, sortKey)).toLowerCase();
      const right = String(sortValue(b, sortKey)).toLowerCase();
      const cmp = left.localeCompare(right, "pt-BR", {
        numeric: true,
        sensitivity: "base",
      });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, locateQuery, sortKey, sortDir, initialAgentStatus]);

  const pageCount = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = displayed.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [locateQuery, sortKey, sortDir, initialAgentStatus, group.slug]);

  const locatedCount = locateQuery
    ? displayed.filter((row) => locateScore(row, locateQuery) > 0).length
    : 0;

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listAssets({
      clientId: clientId || undefined,
      kinds: [...group.kinds],
      osMatch: group.osMatch,
    });
    setLoading(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    setRows((result.data as AssetRow[]) ?? []);
  }, [clientId, group.slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setForm((current) => ({ ...current, kind: group.defaultKind }));
  }, [group.defaultKind]);

  useEffect(() => {
    void listInventoryClients().then((result) => {
      if (result.serverError || !result.data) return;
      setClients(result.data.clients);
      const locked = result.data.restrictedToClientId;
      setRestrictedToClientId(locked);
      if (locked) {
        setClientId(locked);
        setForm((current) => ({ ...current, clientId: locked }));
      }
    });
  }, []);

  function openCreate() {
    setForm({
      ...emptyForm,
      kind: group.defaultKind,
      hostname: isNetwork ? "Pfsense" : "",
      clientId: restrictedToClientId || "",
    });
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
      notes: isPrinters
        ? composePrinterNotes(form.toner, form.notes) || undefined
        : form.notes || undefined,
    });
    setSaving(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    if (result.data?.zabbixWarning) {
      toast.warning(result.data.zabbixWarning);
    } else {
      toast.success(group.createLabel);
    }
    setOpen(false);
    if (result.data?.id) {
      router.push(`/inventario/${result.data.id}`);
      return;
    }
    await load();
  }

  function handleConnect(row: { id: string }) {
    window.open(`/inventario/${row.id}/remoto`, "_blank", "noopener,noreferrer");
  }

  async function handleDelete(row: { id: string; hostname: string }) {
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

  function handleSort(column: SortKey) {
    if (sortKey === column) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column);
    setSortDir("asc");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-tight">{group.title}</h1>
          <p className="text-sm text-muted-foreground">{group.description}</p>
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

      {showMachinesPanel ? (
        <MachinesPanelTable
          rows={paged}
          loading={loading}
          empty={
            rows.length === 0
              ? group.empty
              : "Nenhum registro encontrado neste grupo."
          }
          located={(id) => {
            const row = paged.find((item) => item.id === id);
            return row ? locateScore(row, locateQuery) > 0 : false;
          }}
          deletingId={deletingId}
          onOpen={(row) => router.push(`/inventario/${row.id}`)}
          onConnect={(row) => handleConnect(row)}
          onDelete={(row) => void handleDelete(row)}
        />
      ) : (
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <SortHeader
                label={isPrinters ? "Nome" : isNetwork ? "Equipamento" : "Hostname"}
                column="hostname"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Cliente"
                column="clientName"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Tipo"
                column="kind"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label={isPrinters ? "Modelo" : isNetwork ? "Versão" : "SO"}
                column="os"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label={isNetwork ? "IP LAN" : "IP"}
                column="ip"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Agente"
                column="agentStatus"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
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
            ) : displayed.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>
                  {rows.length === 0
                    ? group.empty
                    : "Nenhum registro encontrado neste grupo."}
                </td>
              </tr>
            ) : (
              paged.map((row) => {
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
                      {row.serial ||
                        (isPrinters
                          ? "Sem marca"
                          : isNetwork
                            ? "Sem acesso"
                            : "Sem serial")}
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
      )}
      {!loading && displayed.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>
            {displayed.length === 1
              ? "1 máquina"
              : `${displayed.length} máquinas`}
            {pageCount > 1 ? ` · página ${currentPage} de ${pageCount}` : ""}
          </p>
          {pageCount > 1 ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={currentPage <= 1}
                aria-label="Página anterior"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft />
              </Button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map(
                (number) => (
                  <Button
                    key={number}
                    type="button"
                    variant={number === currentPage ? "default" : "outline"}
                    size="icon-sm"
                    aria-label={`Página ${number}`}
                    onClick={() => setPage(number)}
                  >
                    {number}
                  </Button>
                )
              )}
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={currentPage >= pageCount}
                aria-label="Próxima página"
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
              >
                <ChevronRight />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{group.createTitle}</DialogTitle>
            <DialogDescription>{group.createHint}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4">
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="asset-client">Cliente</FieldLabel>
                <NativeSelect
                  id="asset-client"
                  className="h-9"
                  required
                  disabled={Boolean(restrictedToClientId)}
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
                  {groupKinds.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
                  <Field>
                <FieldLabel htmlFor="asset-hostname">
                  {isPrinters ? "Nome" : isNetwork ? "Equipamento" : "Hostname"}
                </FieldLabel>
                {isNetwork ? (
                  <NativeSelect
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
                  >
                    {networkHostnames.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
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
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="asset-serial">
                  {isPrinters ? "Marca" : isNetwork ? "Acesso" : "Serial"}
                </FieldLabel>
                <Input
                  id="asset-serial"
                  className="h-9"
                  placeholder={
                    isPrinters
                      ? "HP, Epson, Brother..."
                      : isNetwork
                        ? "Usuário, VPN, URL..."
                        : ""
                  }
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
                <FieldLabel htmlFor="asset-os">
                  {isPrinters
                    ? "Modelo"
                    : isNetwork
                      ? "Versão"
                      : "Sistema operacional"}
                </FieldLabel>
                <Input
                  id="asset-os"
                  className="h-9"
                  placeholder={
                    isPrinters
                      ? "LaserJet Pro M404dn..."
                      : isNetwork
                        ? "2.7.2, 7.16..."
                        : group.slug === "servidores"
                          ? "Microsoft Windows Server 2022..."
                          : "Windows 11, Ubuntu 24.04..."
                  }
                  value={form.os}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, os: event.target.value }))
                  }
                />
              </Field>
              {isPrinters ? (
                <Field>
                  <FieldLabel htmlFor="asset-toner">Cód. Toner/Tinta</FieldLabel>
                  <Input
                    id="asset-toner"
                    className="h-9"
                    placeholder="CF410A, 664, T664..."
                    value={form.toner}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        toner: event.target.value,
                      }))
                    }
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="asset-ip">
                  {isNetwork ? "IP LAN" : "IP"}
                </FieldLabel>
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
                <FieldLabel htmlFor="asset-mac">
                  {isNetwork ? "DDNS" : "MAC"}
                </FieldLabel>
                <Input
                  id="asset-mac"
                  className="h-9"
                  placeholder={isNetwork ? "fw.cliente.example.com" : ""}
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
