"use client";

import { Copy, Eye, EyeOff, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  deleteVaultItem,
  listVaultItems,
  listVaultOptions,
  revealVaultSecret,
  saveVaultItem,
} from "@/actions/cofre";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PasswordInput } from "@/components/ui/password-input";
import {
  vaultKindBadgeClass,
  vaultKinds,
  vaultLabel,
} from "@/config/cofre";
import { clientOptionLabel } from "@/lib/client-code";

type VaultRow = {
  id: string;
  title: string;
  kind: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  clientId: string;
  assetId: string | null;
  clientName: string;
  assetHostname: string | null;
  updatedAt: Date | string;
};

type ClientOption = { id: string; name: string; active: boolean; code?: string | null };
type AssetOption = { id: string; hostname: string; clientId: string };

const emptyForm = {
  clientId: "",
  assetId: "",
  kind: "acesso",
  title: "",
  username: "",
  password: "",
  url: "",
  notes: "",
};

function locateScore(row: VaultRow, query: string) {
  if (!query) return 0;
  const fields = [
    row.title,
    row.username,
    row.url,
    row.clientName,
    row.assetHostname,
    row.notes,
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

export function VaultBoard() {
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [kind, setKind] = useState("");
  const [locate, setLocate] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

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

  const formAssets = useMemo(
    () => assets.filter((item) => item.clientId === form.clientId),
    [assets, form.clientId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listVaultItems({
      clientId: clientId || undefined,
      kind: kind || undefined,
    });
    setLoading(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    setRows((result.data as VaultRow[]) ?? []);
    setRevealed({});
  }, [clientId, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listVaultOptions().then((result) => {
      if (result.serverError || !result.data) return;
      setClients(result.data.clients);
      setAssets(result.data.assets);
    });
  }, []);

  function openCreate() {
    setEditingId(undefined);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row: VaultRow) {
    setEditingId(row.id);
    setForm({
      clientId: row.clientId,
      assetId: row.assetId ?? "",
      kind: row.kind,
      title: row.title,
      username: row.username ?? "",
      password: "",
      url: row.url ?? "",
      notes: row.notes ?? "",
    });
    setOpen(true);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await saveVaultItem({
      id: editingId,
      clientId: form.clientId,
      assetId: form.assetId || undefined,
      kind: form.kind,
      title: form.title,
      username: form.username || undefined,
      password: form.password || undefined,
      url: form.url || undefined,
      notes: form.notes || undefined,
    });
    setSaving(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success(editingId ? "Acesso atualizado." : "Acesso guardado no cofre.");
    setOpen(false);
    await load();
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Excluir "${title}" do cofre?`)) return;
    const result = await deleteVaultItem({ id });
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Registro excluído.");
    await load();
  }

  async function reveal(id: string) {
    if (revealed[id]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }
    setRevealingId(id);
    const result = await revealVaultSecret({ id });
    setRevealingId(null);
    if (result.serverError || !result.data?.password) {
      toast.error(result.serverError || "Não foi possível revelar a senha.");
      return;
    }
    setRevealed((current) => ({ ...current, [id]: result.data.password }));
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  }

  async function copyPassword(id: string) {
    const existing = revealed[id];
    if (existing) {
      await copyText(existing, "Senha");
      return;
    }
    setRevealingId(id);
    const result = await revealVaultSecret({ id });
    setRevealingId(null);
    if (result.serverError || !result.data?.password) {
      toast.error(result.serverError || "Não foi possível copiar a senha.");
      return;
    }
    setRevealed((current) => ({ ...current, [id]: result.data.password }));
    await copyText(result.data.password, "Senha");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-tight">Cofre</h1>
          <p className="text-sm text-muted-foreground">
            Senhas de dispositivos, e-mails e acessos dos clientes. O segredo só
            aparece quando você revela.
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
            placeholder="Localizar título, usuário, URL ou cliente..."
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
              {clientOptionLabel(item)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-44"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="">Todos os tipos</option>
          {vaultKinds.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {locateQuery ? (
        <p className="text-xs text-muted-foreground">
          {locatedCount === 0
            ? "Nenhum acesso localizado."
            : locatedCount === 1
              ? "1 acesso localizado na primeira linha."
              : `${locatedCount} acessos localizados no topo da lista.`}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Título</th>
              <th className="px-3 py-2.5 font-medium">Cliente</th>
              <th className="px-3 py-2.5 font-medium">Tipo</th>
              <th className="px-3 py-2.5 font-medium">Usuário</th>
              <th className="px-3 py-2.5 font-medium">Senha</th>
              <th className="w-28 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={6}>
                  Carregando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={6}>
                  Nenhum acesso no cofre ainda.
                </td>
              </tr>
            ) : (
              displayed.map((row) => {
                const located = locateScore(row, locateQuery) > 0;
                const password = revealed[row.id];
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
                      <p className="font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.assetHostname || row.url || "Sem vínculo"}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">{row.clientName}</td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={vaultKindBadgeClass(row.kind)}
                      >
                        {vaultLabel(vaultKinds, row.kind)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className="truncate">{row.username || "—"}</span>
                        {row.username ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void copyText(row.username!, "Usuário")}
                          >
                            <Copy />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <code className="font-mono text-xs">
                          {password ?? "••••••••"}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={revealingId === row.id}
                          onClick={() => void reveal(row.id)}
                        >
                          {revealingId === row.id ? (
                            <Loader2 className="animate-spin" />
                          ) : password ? (
                            <EyeOff />
                          ) : (
                            <Eye />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={revealingId === row.id}
                          onClick={() => void copyPassword(row.id)}
                        >
                          <Copy />
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void handleDelete(row.id, row.title)}
                      >
                        <Trash2 />
                      </Button>
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
            <DialogTitle>{editingId ? "Editar acesso" : "Novo acesso"}</DialogTitle>
            <DialogDescription>
              Guarde senha de dispositivo, e-mail ou outro acesso do cliente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="grid gap-4">
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="vault-client">Cliente</FieldLabel>
                <NativeSelect
                  id="vault-client"
                  className="h-9"
                  required
                  value={form.clientId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      clientId: event.target.value,
                      assetId: "",
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  {clients
                    .filter((item) => item.active || item.id === form.clientId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {clientOptionLabel(item)}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="vault-kind">Tipo</FieldLabel>
                <NativeSelect
                  id="vault-kind"
                  className="h-9"
                  value={form.kind}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      kind: event.target.value,
                    }))
                  }
                >
                  {vaultKinds.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="vault-title">Título</FieldLabel>
                <Input
                  id="vault-title"
                  className="h-9"
                  required
                  placeholder="Admin local, Microsoft 365, firewall..."
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="vault-asset">Dispositivo</FieldLabel>
                <NativeSelect
                  id="vault-asset"
                  className="h-9"
                  value={form.assetId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      assetId: event.target.value,
                    }))
                  }
                >
                  <option value="">Nenhum</option>
                  {formAssets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.hostname}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="vault-url">URL / endereço</FieldLabel>
                <Input
                  id="vault-url"
                  className="h-9"
                  placeholder="https:// ou IP"
                  value={form.url}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, url: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="vault-username">Usuário / e-mail</FieldLabel>
                <Input
                  id="vault-username"
                  className="h-9"
                  autoComplete="off"
                  value={form.username}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="vault-password">Senha</FieldLabel>
                <PasswordInput
                  id="vault-password"
                  className="h-9"
                  autoComplete="new-password"
                  required={!editingId}
                  placeholder={editingId ? "Em branco para manter" : ""}
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="vault-notes">Observações</FieldLabel>
                <textarea
                  id="vault-notes"
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
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
