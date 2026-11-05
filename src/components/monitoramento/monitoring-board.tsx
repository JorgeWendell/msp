"use client";

import { Maximize2, Minimize2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listMonitorHosts } from "@/actions/monitoramento";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  formatGb,
  formatHostTime,
  formatMbps,
  hostStatusBadgeClass,
  hostStatusLabel,
  hostStatuses,
  hostTileClass,
  hostTileMutedClass,
  statusRank,
  worstStatus,
  type HostStatus,
  type MonitorHost,
} from "@/config/monitoramento";
import { cn } from "@/lib/utils";

function locateScore(host: MonitorHost, query: string) {
  if (!query) return 0;
  const fields = [host.name, host.ip, host.client, host.group];
  let best = 0;
  for (const field of fields) {
    const value = field.toLowerCase().trim();
    if (value === query) best = Math.max(best, 3);
    else if (value.startsWith(query)) best = Math.max(best, 2);
    else if (value.includes(query)) best = Math.max(best, 1);
  }
  return best;
}

function MetricChip({
  label,
  value,
  hot,
}: {
  label: string;
  value: string;
  hot?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium tracking-wider uppercase opacity-70">
        {label}
      </p>
      <p
        className={cn(
          "truncate font-mono text-xs font-semibold tabular-nums",
          hot && "underline decoration-2 underline-offset-2"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function HostTile({
  host,
  selected,
  onSelect,
}: {
  host: MonitorHost;
  selected: boolean;
  onSelect: () => void;
}) {
  const metrics = host.metrics;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex min-h-29 flex-col rounded-lg border p-2.5 text-left transition-all",
        hostTileClass(host.status),
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        host.status === "critico" && "animate-[pulse_2.6s_ease-in-out_infinite]"
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold tracking-tight">
            {host.name}
          </p>
          <p className={cn("truncate text-[11px]", hostTileMutedClass(host.status))}>
            {host.ip}
          </p>
        </div>
        <span className="shrink-0 rounded bg-black/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
          {hostStatusLabel(host.status)}
        </span>
      </div>
      <div className="mt-auto grid grid-cols-4 gap-1.5">
        <MetricChip
          label="CPU"
          value={metrics ? `${Math.round(metrics.cpuPercent)}%` : "—"}
          hot={!!metrics && metrics.cpuPercent >= 90}
        />
        <MetricChip
          label="MEM"
          value={metrics ? `${Math.round(metrics.memoryPercent)}%` : "—"}
          hot={!!metrics && metrics.memoryPercent >= 90}
        />
        <MetricChip
          label="DSK"
          value={metrics ? `${Math.round(metrics.diskPercent)}%` : "—"}
          hot={!!metrics && metrics.diskPercent >= 90}
        />
        <MetricChip
          label="NET"
          value={
            metrics
              ? `${Math.round(Math.max(metrics.netInMbps, metrics.netOutMbps))}`
              : "—"
          }
        />
      </div>
    </button>
  );
}

export function MonitoringBoard() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hosts, setHosts] = useState<MonitorHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locate, setLocate] = useState("");
  const [status, setStatus] = useState("");
  const [client, setClient] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const result = await listMonitorHosts();
    if (result.serverError) {
      setError(result.serverError);
      setHosts([]);
      setLoading(false);
      return;
    }
    setConfigured(result.data?.configured ?? false);
    setError(result.data?.error ?? null);
    setHosts(result.data?.hosts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setCanFullscreen(document.fullscreenEnabled);
    function syncFullscreen() {
      const node = rootRef.current;
      setFullscreen(Boolean(node && document.fullscreenElement === node));
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    const node = rootRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement === node) {
        await document.exitFullscreen();
        return;
      }
      await node.requestFullscreen();
    } catch {
      setFullscreen(false);
    }
  }

  const locateQuery = locate.trim().toLowerCase();
  const clients = useMemo(
    () => Array.from(new Set(hosts.map((item) => item.client))).sort(),
    [hosts]
  );

  const counts = useMemo(() => {
    const next: Record<HostStatus, number> = {
      online: 0,
      alerta: 0,
      critico: 0,
      offline: 0,
    };
    for (const host of hosts) next[host.status] += 1;
    return next;
  }, [hosts]);

  const displayed = useMemo(() => {
    return hosts
      .map((host) => ({ host, score: locateScore(host, locateQuery) }))
      .filter(({ host, score }) => {
        if (status && host.status !== status) return false;
        if (client && host.client !== client) return false;
        if (locateQuery && score === 0) return false;
        return true;
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          statusRank[a.host.status] - statusRank[b.host.status] ||
          a.host.name.localeCompare(b.host.name)
      )
      .map((item) => item.host);
  }, [client, hosts, locateQuery, status]);

  const walls = useMemo(() => {
    const byClient = new Map<string, MonitorHost[]>();
    for (const host of displayed) {
      const list = byClient.get(host.client) ?? [];
      list.push(host);
      byClient.set(host.client, list);
    }
    return Array.from(byClient.entries())
      .map(([name, items]) => ({
        name,
        hosts: items,
        worst: worstStatus(items),
        problems: items.filter((item) => item.status !== "online").length,
      }))
      .sort(
        (a, b) =>
          statusRank[a.worst] - statusRank[b.worst] ||
          b.problems - a.problems ||
          a.name.localeCompare(b.name)
      );
  }, [displayed]);

  const incidents = useMemo(
    () =>
      displayed.filter((host) => host.status !== "online").slice(0, 12),
    [displayed]
  );

  const selected = displayed.find((host) => host.id === selectedId) ?? null;
  const clock = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);

  const kpis = [
    {
      key: "critico",
      label: "Crítico",
      value: counts.critico,
      className: "bg-red-600 text-white",
    },
    {
      key: "offline",
      label: "Offline",
      value: counts.offline,
      className: "bg-zinc-600 text-white",
    },
    {
      key: "alerta",
      label: "Alerta",
      value: counts.alerta,
      className: "bg-amber-400 text-zinc-950",
    },
    {
      key: "online",
      label: "Online",
      value: counts.online,
      className: "bg-teal-400 text-teal-950",
    },
  ] as const;

  return (
    <div
      ref={rootRef}
      className={cn(
        fullscreen && "h-full overflow-y-auto bg-background p-4 sm:p-6"
      )}
    >
    <div className="grid gap-4 pb-40">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
            NOC · operação
          </p>
          <h1 className="font-heading text-2xl tracking-tight">Monitoramento</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={configured && !error ? "secondary" : "outline"}>
            {error || !configured ? "Zabbix offline" : "Zabbix ao vivo"}
          </Badge>
          <p className="rounded-md border bg-card px-2.5 py-1 font-mono text-sm tabular-nums">
            {clock}
          </p>
          {canFullscreen ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => void toggleFullscreen()}
              aria-pressed={fullscreen}
            >
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
              {fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const active = status === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatus(active ? "" : item.key)}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2.5 text-left",
                item.className,
                active && "ring-2 ring-ring ring-offset-2 ring-offset-background"
              )}
            >
              <span className="text-[11px] font-semibold tracking-wider uppercase">
                {item.label}
              </span>
              <span className="font-heading text-2xl leading-none tabular-nums">
                {item.value}
              </span>
            </button>
          );
        })}
      </div>

      {incidents.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
          <span className="px-1 py-1 text-[11px] font-semibold tracking-wide text-destructive uppercase">
            Fila
          </span>
          {incidents.map((host) => (
            <button
              key={host.id}
              type="button"
              onClick={() => setSelectedId(host.id)}
              className={cn(
                "rounded-md px-2 py-1 font-mono text-[11px] font-medium",
                hostTileClass(host.status)
              )}
            >
              {host.client.split(" ")[0]} · {host.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            value={locate}
            placeholder="Localizar cliente, host ou IP..."
            onChange={(event) => setLocate(event.target.value)}
          />
        </div>
        <NativeSelect
          className="h-9 min-w-52"
          value={client}
          onChange={(event) => setClient(event.target.value)}
        >
          <option value="">Todos os clientes</option>
          {clients.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-44"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Todos os status</option>
          {hostStatuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {error || !configured ? (
        <div className="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">
          {error ||
            "Configure ZABBIX_URL e ZABBIX_TOKEN (ou usuário/senha) no .env para o mural falar com o Zabbix."}
        </div>
      ) : loading && hosts.length === 0 ? (
        <div className="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">
          Consultando o Zabbix...
        </div>
      ) : walls.length === 0 ? (
        <div className="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhum host no Zabbix ainda. Cadastre um servidor no inventário.
        </div>
      ) : (
        <div className="grid gap-5">
          {walls.map((wall) => (
            <section key={wall.name} className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      wall.worst === "critico" && "bg-red-600",
                      wall.worst === "offline" && "bg-zinc-500",
                      wall.worst === "alerta" && "bg-amber-400",
                      wall.worst === "online" && "bg-emerald-500"
                    )}
                  />
                  <h2 className="truncate text-sm font-semibold">{wall.name}</h2>
                  <Badge
                    variant="outline"
                    className={hostStatusBadgeClass(wall.worst)}
                  >
                    {wall.problems > 0
                      ? `${wall.problems} com problema`
                      : "estável"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {wall.hosts.length} hosts
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                {wall.hosts.map((host) => (
                  <HostTile
                    key={host.id}
                    host={host}
                    selected={host.id === selectedId}
                    onSelect={() =>
                      setSelectedId((current) =>
                        current === host.id ? null : host.id
                      )
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected ? (
        <div
          className={cn(
            "fixed right-4 bottom-4 left-4 z-20 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur-sm",
            !fullscreen && "lg:left-78"
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">{selected.client}</p>
              <p className="truncate font-mono text-sm font-semibold">
                {selected.name} · {selected.ip}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={hostStatusBadgeClass(selected.status)}
              >
                {hostStatusLabel(selected.status)}
              </Badge>
              <p className="text-[11px] text-muted-foreground">
                {formatHostTime(selected.updatedAt)}
              </p>
            </div>
          </div>
          {selected.problems.length > 0 ? (
            <div className="mt-3 grid gap-1.5">
              {selected.problems.map((problem) => (
                <div
                  key={problem.name}
                  className={cn(
                    "flex items-start gap-2 rounded-md border px-2.5 py-1.5",
                    problem.severity === "critico"
                      ? "border-destructive/40 bg-destructive/10"
                      : "border-amber-400/40 bg-amber-400/10"
                  )}
                >
                  <Badge
                    variant="outline"
                    className={hostStatusBadgeClass(problem.severity)}
                  >
                    {hostStatusLabel(problem.severity)}
                  </Badge>
                  <p className="min-w-0 pt-0.5 text-sm leading-snug">{problem.name}</p>
                </div>
              ))}
            </div>
          ) : null}
          {selected.metrics ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  CPU
                </p>
                <p className="font-mono text-lg tabular-nums">
                  {Math.round(selected.metrics.cpuPercent)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  Memória
                </p>
                <p className="font-mono text-lg tabular-nums">
                  {Math.round(selected.metrics.memoryPercent)}%
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatGb(selected.metrics.memoryUsedGb)} /{" "}
                  {formatGb(selected.metrics.memoryTotalGb)}
                </p>
              </div>
              <div>
                <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  Disco {selected.metrics.diskMount}
                </p>
                <p className="font-mono text-lg tabular-nums">
                  {Math.round(selected.metrics.diskPercent)}%
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatGb(selected.metrics.diskUsedGb)} /{" "}
                  {formatGb(selected.metrics.diskTotalGb)}
                </p>
              </div>
              <div>
                <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  Rede {selected.metrics.netInterface}
                </p>
                <p className="font-mono text-sm tabular-nums">
                  ↓ {formatMbps(selected.metrics.netInMbps)}
                </p>
                <p className="font-mono text-sm tabular-nums">
                  ↑ {formatMbps(selected.metrics.netOutMbps)}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Sem coleta. Host offline.
            </p>
          )}
        </div>
      ) : null}
    </div>
    </div>
  );
}
