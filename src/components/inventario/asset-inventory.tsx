"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { getAssetInventory } from "@/actions/inventario";
import { AssetTickets } from "@/components/inventario/asset-tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAssetDate } from "@/config/inventario";

type Payload = {
  collectedAt?: string;
  system?: Record<string, unknown>;
  cpu?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  motherboard?: Record<string, unknown>;
  printers?: unknown[];
  disks?: Record<string, unknown>[];
  network?: { publicIp?: string; adapters?: Record<string, unknown>[] };
  users?: unknown[];
  software?: Record<string, unknown>[];
  processes?: Record<string, unknown>[];
  services?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
};

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ativado" : "Desativado";
  return String(value);
}

function serviceStatusLabel(value: unknown) {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "running") return "Executando";
  if (raw === "stopped") return "Parado";
  if (raw === "paused") return "Pausado";
  if (raw.includes("pending")) return "Pendente";
  return text(value);
}

function serviceStartLabel(value: unknown) {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "automatic" || raw === "boot" || raw === "system") return "Automático";
  if (raw.includes("delayed")) return "Automático (atrasado)";
  if (raw === "manual") return "Manual";
  if (raw === "disabled") return "Desativado";
  return text(value);
}

function serviceIsRunning(value: unknown) {
  return String(value ?? "").toLowerCase() === "running";
}

function remoteSoon() {
  toast.message("O comando remoto pelo agente ainda não está disponível.");
}

function Dl({ items }: { items: [string, unknown][] }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="break-all">{text(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="border-b bg-muted/50 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyInventory() {
  return (
    <div className="overflow-hidden rounded-xl border px-3 py-8 text-center text-sm text-muted-foreground">
      Ainda não há inventário do agente nesta máquina.
    </div>
  );
}

function InventoryTable({
  columns,
  children,
}: {
  columns: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2.5 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function DetailTab({ payload }: { payload: Payload }) {
  const system = payload.system ?? {};
  const cpu = payload.cpu ?? {};
  const memory = payload.memory ?? {};
  const board = payload.motherboard ?? {};

  return (
    <div className="space-y-4">
      <Section title="Sistema">
        <Dl
          items={[
            ["SO", system.os],
            ["Versão", system.version],
            ["Arquitetura", system.arch],
            ["Hostname", system.hostname],
            ["Domínio", system.domain],
            ["Usuário logado", system.loggedUser],
            ["Antivírus", system.antivirus],
            ["Chave Windows", system.windowsKey],
            ["Número de série", system.serial],
            ["Secure Boot", system.secureBoot],
            ["Formatação", system.installedAt],
            ["Última atualização", system.lastUpdateAt],
            [
              "Tempo ligado",
              system.uptimeHours != null ? `${system.uptimeHours} horas` : null,
            ],
            ["Tipo de máquina", system.machineType],
          ]}
        />
      </Section>
      <Section title="CPU">
        <Dl
          items={[
            ["Modelo", cpu.model],
            ["Arquitetura", cpu.arch],
            ["Frequência", cpu.frequencyMhz != null ? `${cpu.frequencyMhz} MHz` : null],
            ["Núcleos físicos", cpu.physicalCores],
            ["Núcleos lógicos", cpu.logicalCores],
            ["Temperatura", cpu.temperatureC != null ? `${cpu.temperatureC}°C` : null],
            ["Uso de CPU", cpu.usagePercent != null ? `${cpu.usagePercent}%` : null],
          ]}
        />
      </Section>
      <Section title="Memória">
        <Dl
          items={[
            ["Total", memory.total],
            ["Disponível", memory.available],
            ["Utilizada", memory.used],
            ["Porcentagem", memory.percent != null ? `${memory.percent}%` : null],
            ["Tipo", memory.type],
            ["Velocidade", memory.speedMhz != null ? `${memory.speedMhz} MHz` : null],
          ]}
        />
      </Section>
      <Section title="Placa-mãe">
        <Dl
          items={[
            ["Fabricante", board.manufacturer],
            ["Modelo", board.model],
            ["Modelo detalhado", board.detailedModel],
            ["BIOS", board.bios],
            ["Data BIOS", board.biosDate],
          ]}
        />
      </Section>
      <Section title={`Impressoras (${payload.printers?.length ?? 0})`}>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {(payload.printers ?? []).map((item, index) => (
            <li key={`${item}-${index}`}>{text(item)}</li>
          ))}
        </ul>
      </Section>
      <Section title="Armazenamento">
        <InventoryTable
          columns={[
            "Disco",
            "Letra",
            "Tamanho (GB)",
            "Disponível (GB)",
            "Status",
            "Temperatura",
            "BitLocker",
          ]}
        >
          {(payload.disks ?? []).map((disk, index) => (
            <tr key={index} className="border-t">
              <td className="px-3 py-2">{text(disk.disk)}</td>
              <td className="px-3 py-2">{text(disk.letter)}</td>
              <td className="px-3 py-2">{text(disk.sizeGb)}</td>
              <td className="px-3 py-2">{text(disk.freeGb)}</td>
              <td className="px-3 py-2">{text(disk.status)}</td>
              <td className="px-3 py-2">{text(disk.temperature)}</td>
              <td className="px-3 py-2">{text(disk.bitlocker)}</td>
            </tr>
          ))}
        </InventoryTable>
      </Section>
      <Section title="Rede">
        <p className="mb-3 text-sm">IP público: {text(payload.network?.publicIp)}</p>
        <InventoryTable
          columns={["Nome", "Descrição", "Tipo", "IPv4", "MAC", "Gateway"]}
        >
          {(payload.network?.adapters ?? []).map((nic, index) => (
            <tr key={index} className="border-t">
              <td className="px-3 py-2">{text(nic.name)}</td>
              <td className="px-3 py-2">{text(nic.description)}</td>
              <td className="px-3 py-2">{text(nic.type)}</td>
              <td className="px-3 py-2">{text(nic.ipv4)}</td>
              <td className="px-3 py-2">{text(nic.mac)}</td>
              <td className="px-3 py-2">{text(nic.gateway)}</td>
            </tr>
          ))}
        </InventoryTable>
      </Section>
      <Section title="Usuários">
        <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {(payload.users ?? []).map((item) => (
            <li key={String(item)}>{text(item)}</li>
          ))}
        </ul>
      </Section>
      {(payload.events?.length ?? 0) > 0 ? (
        <Section title="Event Viewer">
          <ul className="grid max-h-64 gap-2 overflow-y-auto text-sm">
            {(payload.events ?? []).map((item, index) => (
              <li key={index}>
                <p>
                  {text(item.level)} · {text(item.source)} · {text(item.time)}
                </p>
                <p className="text-xs text-muted-foreground">{text(item.message)}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function SoftwareTab({ items }: { items: Record<string, unknown>[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.name, item.version, item.publisher, item.description]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(term))
    );
  }, [items, query]);

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Softwares instalados ({filtered.length})
        </p>
        <div className="relative min-w-64 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8"
            placeholder="Pesquisar por nome, versão ou fornecedor"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <InventoryTable columns={["Nome do software", "Versão", "Descrição", "Ações"]}>
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
              Nenhum software encontrado.
            </td>
          </tr>
        ) : (
          filtered.map((item, index) => (
            <tr key={`${item.name}-${index}`} className="border-t">
              <td className="px-3 py-2">{text(item.name)}</td>
              <td className="px-3 py-2">{text(item.version)}</td>
              <td className="px-3 py-2">{text(item.publisher ?? item.description)}</td>
              <td className="px-3 py-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={remoteSoon}
                >
                  Desinstalar
                </Button>
              </td>
            </tr>
          ))
        )}
      </InventoryTable>
    </div>
  );
}

function ProcessesTab({ items }: { items: Record<string, unknown>[] }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="border-b bg-muted/50 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Processos do Windows ({items.length} processos)
      </div>
      <InventoryTable columns={["Nome", "PID", "Tipo", "Caminho", "Ações"]}>
        {items.map((item) => (
          <tr key={String(item.pid)} className="border-t">
            <td className="px-3 py-2">{text(item.name)}</td>
            <td className="px-3 py-2">{text(item.pid)}</td>
            <td className="px-3 py-2">{text(item.kind ?? "Apps")}</td>
            <td className="max-w-md truncate px-3 py-2" title={text(item.path)}>
              {text(item.path)}
            </td>
            <td className="px-3 py-2">
              <Button type="button" variant="outline" size="xs" onClick={remoteSoon}>
                Encerrar
              </Button>
            </td>
          </tr>
        ))}
      </InventoryTable>
    </div>
  );
}

function ServicesTab({ items }: { items: Record<string, unknown>[] }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="border-b bg-muted/50 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Serviços do Windows ({items.length})
      </div>
      <InventoryTable
        columns={["Nome do serviço", "Status", "Tipo de inicialização", "Ações"]}
      >
        {items.map((item) => {
          const running = serviceIsRunning(item.status);
          return (
            <tr key={String(item.name)} className="border-t">
              <td className="px-3 py-2">
                <p>{text(item.displayName || item.name)}</p>
                {item.displayName && item.name !== item.displayName ? (
                  <p className="text-xs text-muted-foreground">{text(item.name)}</p>
                ) : null}
              </td>
              <td className="px-3 py-2">{serviceStatusLabel(item.status)}</td>
              <td className="px-3 py-2">{serviceStartLabel(item.startType)}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {running ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={remoteSoon}
                      >
                        Parar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={remoteSoon}
                      >
                        Reiniciar
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={remoteSoon}
                    >
                      Iniciar
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </InventoryTable>
    </div>
  );
}

export function AssetInventory({
  assetId,
  clientId,
}: {
  assetId: string;
  clientId: string;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [collectedAt, setCollectedAt] = useState<Date | string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getAssetInventory({ id: assetId });
    setLoading(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    if (!result.data) {
      setPayload(null);
      return;
    }
    setCollectedAt(result.data.collectedAt);
    setPayload(result.data.payload as Payload);
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {loading
          ? "Carregando inventário coletado..."
          : payload
            ? `Coletado em ${formatAssetDate(collectedAt)}`
            : "Aguardando o primeiro inventário do agente."}
      </p>
      <Tabs defaultValue="detalhe" className="gap-3">
        <TabsList variant="line" className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="detalhe">Detalhe</TabsTrigger>
          <TabsTrigger value="softwares">Softwares</TabsTrigger>
          <TabsTrigger value="processos">Processos</TabsTrigger>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="chamados">Chamados</TabsTrigger>
        </TabsList>
        <TabsContent value="detalhe">
          {payload ? <DetailTab payload={payload} /> : <EmptyInventory />}
        </TabsContent>
        <TabsContent value="softwares">
          {payload ? <SoftwareTab items={payload.software ?? []} /> : <EmptyInventory />}
        </TabsContent>
        <TabsContent value="processos">
          {payload ? (
            <ProcessesTab items={payload.processes ?? []} />
          ) : (
            <EmptyInventory />
          )}
        </TabsContent>
        <TabsContent value="servicos">
          {payload ? <ServicesTab items={payload.services ?? []} /> : <EmptyInventory />}
        </TabsContent>
        <TabsContent value="chamados">
          <AssetTickets clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
