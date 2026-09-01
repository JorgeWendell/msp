"use client";

import { Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deleteAsset,
  getAsset,
  listInventoryClients,
  rotateAgentToken,
  saveAsset,
} from "@/actions/inventario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  agentStatusBadgeClass,
  agentStatuses,
  assetKinds,
  assetLabel,
  formatAssetDate,
} from "@/config/inventario";
import { AssetInventory } from "@/components/inventario/asset-inventory";

type Detail = {
  id: string;
  hostname: string;
  serial: string | null;
  kind: string;
  os: string | null;
  ip: string | null;
  mac: string | null;
  location: string | null;
  notes: string | null;
  active: boolean;
  clientId: string;
  clientName: string;
  agentStatus: string;
  agentToken: string;
  agentVersion: string | null;
  lastSeenAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ClientOption = { id: string; name: string; active: boolean; code?: string | null };

export function InventoryDetail({ id }: { id: string }) {
  const router = useRouter();
  const [asset, setAsset] = useState<Detail | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientLocked, setClientLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getAsset({ id });
    setLoading(false);
    if (result.serverError || !result.data) {
      toast.error(result.serverError || "Não foi possível carregar a máquina.");
      return;
    }
    setAsset(result.data as Detail);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listInventoryClients().then((result) => {
      if (result.serverError || !result.data) return;
      setClients(result.data.clients);
      setClientLocked(Boolean(result.data.restrictedToClientId));
    });
  }, []);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    const result = await saveAsset({
      id: asset.id,
      clientId: String(data.get("clientId") || ""),
      hostname: String(data.get("hostname") || ""),
      serial: String(data.get("serial") || "") || undefined,
      kind: String(data.get("kind") || asset.kind),
      os: String(data.get("os") || "") || undefined,
      ip: String(data.get("ip") || "") || undefined,
      mac: String(data.get("mac") || "") || undefined,
      location: String(data.get("location") || "") || undefined,
      notes: String(data.get("notes") || "") || undefined,
      active: data.get("active") === "on",
    });
    setSaving(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Máquina atualizada.");
    await load();
  }

  async function handleCopyToken() {
    if (!asset) return;
    await navigator.clipboard.writeText(asset.agentToken);
    toast.success("Token copiado.");
  }

  async function handleRotate() {
    if (!asset) return;
    if (
      !confirm(
        "Gerar um novo token invalida o anterior. O agente precisará ser reconfigurado."
      )
    ) {
      return;
    }
    setRotating(true);
    const result = await rotateAgentToken({ id: asset.id });
    setRotating(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Novo token gerado.");
    await load();
  }

  async function handleDelete() {
    if (!asset) return;
    if (!confirm(`Excluir a máquina ${asset.hostname}?`)) return;
    const result = await deleteAsset({ id: asset.id });
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Máquina excluída.");
    router.push("/inventario");
  }

  if (loading || !asset) {
    return (
      <div className="overflow-hidden rounded-xl border px-3 py-8 text-center text-sm text-muted-foreground">
        {loading ? "Carregando máquina..." : "Máquina não encontrada."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Link href="/inventario" className="hover:underline">
              Inventário
            </Link>{" "}
            · {asset.clientName}
          </p>
          <h1 className="font-heading text-2xl tracking-tight">{asset.hostname}</h1>
          <p className="text-sm text-muted-foreground">
            Cadastrada em {formatAssetDate(asset.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={asset.active ? "secondary" : "outline"}>
            {asset.active ? "Ativa" : "Inativa"}
          </Badge>
          <Badge
            variant="outline"
            className={agentStatusBadgeClass(asset.agentStatus)}
          >
            {assetLabel(agentStatuses, asset.agentStatus)}
          </Badge>
        </div>
      </div>

      <form
        key={`${asset.id}-${String(asset.updatedAt)}`}
        onSubmit={handleSave}
        className="overflow-hidden rounded-xl border"
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Identificação
          </p>
          <Button type="submit" disabled={saving} className="h-7 px-3">
            {saving ? <Loader2 className="animate-spin" /> : null}
            Salvar
          </Button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="asset-client">Cliente</FieldLabel>
            {clientLocked ? (
              <input type="hidden" name="clientId" value={asset.clientId} />
            ) : null}
            <NativeSelect
              id="asset-client"
              name={clientLocked ? undefined : "clientId"}
              className="h-9"
              defaultValue={asset.clientId}
              disabled={clientLocked}
              required
            >
              {clients
                .filter((item) => item.active || item.id === asset.clientId)
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
              name="kind"
              className="h-9"
              defaultValue={asset.kind}
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
              name="hostname"
              className="h-9"
              required
              defaultValue={asset.hostname}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset-serial">Serial</FieldLabel>
            <Input
              id="asset-serial"
              name="serial"
              className="h-9"
              defaultValue={asset.serial ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset-os">Sistema operacional</FieldLabel>
            <Input
              id="asset-os"
              name="os"
              className="h-9"
              defaultValue={asset.os ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset-ip">IP</FieldLabel>
            <Input
              id="asset-ip"
              name="ip"
              className="h-9"
              defaultValue={asset.ip ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset-mac">MAC</FieldLabel>
            <Input
              id="asset-mac"
              name="mac"
              className="h-9"
              defaultValue={asset.mac ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset-location">Local</FieldLabel>
            <Input
              id="asset-location"
              name="location"
              className="h-9"
              defaultValue={asset.location ?? ""}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="asset-notes">Observações</FieldLabel>
            <textarea
              id="asset-notes"
              name="notes"
              className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              defaultValue={asset.notes ?? ""}
            />
          </Field>
          <label className="flex h-8 items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="active"
              defaultChecked={asset.active}
            />
            Máquina ativa no inventário
          </label>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <div className="border-b bg-muted/50 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Agente
        </div>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            {asset.lastSeenAt
              ? "O agente já reportou status nesta máquina."
              : "Na instalação o técnico informa o código do cliente (XXX-XXX). Esse código atrela a máquina ao cliente. O token abaixo fica para o agente continuar reportando depois."}
          </p>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd>{assetLabel(agentStatuses, asset.agentStatus)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Último contato</dt>
              <dd>{formatAssetDate(asset.lastSeenAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Versão do agente</dt>
              <dd>{asset.agentVersion || "—"}</dd>
            </div>
          </dl>
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">Token de registro</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
                {asset.agentToken}
              </code>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3"
                onClick={() => void handleCopyToken()}
              >
                <Copy />
                Copiar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3"
                disabled={rotating}
                onClick={() => void handleRotate()}
              >
                {rotating ? <Loader2 className="animate-spin" /> : null}
                Novo token
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AssetInventory assetId={asset.id} clientId={asset.clientId} />

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-9 px-3 text-destructive"
          onClick={() => void handleDelete()}
        >
          Excluir máquina
        </Button>
      </div>
    </div>
  );
}
