"use client";

import {
  ChevronDown,
  Clock,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listMonitorHosts } from "@/actions/monitoramento";
import {
  formatGb,
  formatHostTime,
  formatMbps,
  hostStatusLabel,
  hostStatuses,
  statusRank,
  worstStatus,
  type HostStatus,
  type MonitorHost,
} from "@/config/monitoramento";
import { cn } from "@/lib/utils";

const canvas = "#111217";
const panel = "#181b1f";
const text = "#ccccdc";
const secondary = "rgba(204, 204, 220, 0.65)";
const weak = "rgba(204, 204, 220, 0.45)";
const line = "rgba(204, 204, 220, 0.12)";
const lineStrong = "rgba(204, 204, 220, 0.22)";
const blue = "#6e9fff";

function statusColor(status: HostStatus) {
  if (status === "critico") return "#f2495c";
  if (status === "alerta") return "#ff9830";
  if (status === "offline") return "#8e8ea0";
  return "#73bf69";
}

function gaugeColor(percent: number) {
  if (percent >= 90) return "#f2495c";
  if (percent >= 70) return "#ff9830";
  return "#73bf69";
}

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

const fieldClass =
  "h-7 rounded-[2px] border border-[rgba(204,204,220,0.22)] bg-transparent px-2 text-[13px] text-[#ccccdc] outline-none [color-scheme:dark] focus:border-[#6e9fff]";

function BarGauge({ label, value }: { label: string; value: number | null }) {
  const percent = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color = value == null ? "transparent" : gaugeColor(percent);
  return (
    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_2.15rem] items-center gap-1.5">
      <span className="text-[11px]" style={{ color: secondary }}>
        {label}
      </span>
      <div className="h-1.5" style={{ background: "rgba(204, 204, 220, 0.16)" }}>
        <div className="h-full" style={{ width: `${percent}%`, background: color }} />
      </div>
      <span
        className="text-right text-[11px] tabular-nums"
        style={{ color: value != null && percent >= 90 ? "#f2495c" : text }}
      >
        {value == null ? "—" : `${Math.round(value)}%`}
      </span>
    </div>
  );
}

function HostPanel({
  host,
  selected,
  onSelect,
}: {
  host: MonitorHost;
  selected: boolean;
  onSelect: () => void;
}) {
  const metrics = host.metrics;
  const color = statusColor(host.status);

  return (
    <button
      type="button"
      onClick={onSelect}
      title={host.name}
      className="overflow-hidden rounded-[2px] border text-left transition-colors"
      style={{
        background: panel,
        borderColor: selected ? blue : line,
        borderLeftColor: color,
        borderLeftWidth: 3,
      }}
    >
      <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
        <span className="truncate text-[13px] font-medium" style={{ color: text }}>
          {host.name}
        </span>
        <span
          className="shrink-0 text-[11px] font-medium tracking-wide uppercase"
          style={{ color }}
        >
          {hostStatusLabel(host.status)}
        </span>
      </div>
      <div className="grid gap-1.5 px-2.5 pt-1 pb-2.5">
        <span className="block truncate text-[11px]" style={{ color: secondary }}>
          {host.ip || "sem IP"}
        </span>
        {metrics ? (
          <>
            <BarGauge label="CPU" value={metrics.cpuPercent} />
            <BarGauge label="MEM" value={metrics.memoryPercent} />
            <BarGauge label="DSK" value={metrics.diskPercent} />
            <span className="block truncate text-[11px]" style={{ color: secondary }}>
              <span style={{ color: text }}>↓ {formatMbps(metrics.netInMbps)}</span>
              <span className="mx-1.5" style={{ color: weak }}>
                ·
              </span>
              <span style={{ color: text }}>↑ {formatMbps(metrics.netOutMbps)}</span>
            </span>
          </>
        ) : (
          <span className="block py-3 text-center text-[13px]" style={{ color: weak }}>
            Sem dados
          </span>
        )}
      </div>
    </button>
  );
}

function DetailGauge({
  label,
  percent,
  hint,
}: {
  label: string;
  percent: number;
  hint?: string;
}) {
  const color = gaugeColor(percent);
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px]" style={{ color: secondary }}>
          {label}
        </span>
        <span className="text-lg leading-none font-medium tabular-nums" style={{ color }}>
          {Math.round(percent)}%
        </span>
      </div>
      <div className="h-2" style={{ background: "rgba(204, 204, 220, 0.16)" }}>
        <div
          className="h-full"
          style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: color }}
        />
      </div>
      {hint ? (
        <p className="text-[12px]" style={{ color: weak }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function MonitoringBoard() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hosts, setHosts] = useState<MonitorHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locate, setLocate] = useState("");
  const [status, setStatus] = useState("");
  const [client, setClient] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await listMonitorHosts();
      if (result.serverError) {
        setError(result.serverError);
        setHosts([]);
        return;
      }
      setConfigured(result.data?.configured ?? false);
      setError(result.data?.error ?? null);
      setHosts(result.data?.hosts ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      setRefreshing(true);
      void load();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const kick = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function syncFullscreen() {
      const node = rootRef.current;
      setFullscreen(Boolean(node && document.fullscreenElement === node));
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    const node = rootRef.current;
    if (!node || !document.fullscreenEnabled) return;
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

  const problemRows = useMemo(() => {
    const rows: Array<{
      key: string;
      host: MonitorHost;
      severity: HostStatus;
      name: string;
    }> = [];
    for (const host of displayed) {
      if (host.problems.length > 0) {
        host.problems.forEach((problem, index) => {
          rows.push({
            key: `${host.id}-${index}`,
            host,
            severity: problem.severity,
            name: problem.name,
          });
        });
      } else if (host.status !== "online") {
        rows.push({
          key: host.id,
          host,
          severity: host.status,
          name: host.status === "offline" ? "Host sem coleta" : "Host em alerta",
        });
      }
    }
    rows.sort(
      (a, b) =>
        statusRank[a.severity] - statusRank[b.severity] ||
        a.host.name.localeCompare(b.host.name)
    );
    return rows;
  }, [displayed]);

  const selected = displayed.find((host) => host.id === selectedId) ?? null;
  const clock = now
    ? new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(now)
    : "--:--:--";
  const statsReady = configured && !error && !(loading && hosts.length === 0);
  const offline = Boolean(error) || !configured;

  const kpis = [
    { key: "critico" as const, label: "Crítico", value: counts.critico, bg: "#f2495c", fg: "#ffffff" },
    { key: "offline" as const, label: "Offline", value: counts.offline, bg: "#6e6e7a", fg: "#ffffff" },
    { key: "alerta" as const, label: "Alerta", value: counts.alerta, bg: "#ff9830", fg: canvas },
    { key: "online" as const, label: "Online", value: counts.online, bg: "#73bf69", fg: canvas },
  ];

  const iconButtonClass =
    "flex size-8 items-center justify-center rounded-[2px] transition-colors hover:bg-[rgba(204,204,220,0.08)]";

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex flex-col bg-[#111217] text-[#ccccdc] scheme-dark",
        fullscreen
          ? "h-dvh overflow-y-auto"
          : "-m-4 min-h-[calc(100svh-4rem)] sm:-m-6"
      )}
    >
      <div
        className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4"
        style={{ borderColor: line }}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden sm:inline" style={{ color: secondary }}>
            Dashboards
          </span>
          <span className="hidden sm:inline" style={{ color: weak }}>
            /
          </span>
          <h1 className="truncate font-medium" style={{ color: text }}>
            Monitoramento
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="hidden items-center gap-1.5 text-[13px] sm:flex"
            style={{ color: offline ? "#f2495c" : "#73bf69" }}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {offline ? "Zabbix offline" : "Ao vivo"}
          </span>
          <div
            className="flex h-8 items-center gap-2 rounded-[2px] border px-2 text-[13px]"
            style={{ borderColor: lineStrong }}
          >
            <Clock className="size-4" style={{ color: secondary }} />
            <span className="tabular-nums">{clock}</span>
          </div>
          <button
            type="button"
            className={iconButtonClass}
            onClick={() => {
              setRefreshing(true);
              void load();
            }}
            aria-label="Atualizar"
            title="Atualizar"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          </button>
          <span
            className="hidden h-8 items-center rounded-[2px] border px-2 text-[13px] md:flex"
            style={{ borderColor: lineStrong, color: secondary }}
            title="Atualiza a cada 20 segundos"
          >
            20s
          </span>
          <button
            type="button"
            className={iconButtonClass}
            onClick={() => void toggleFullscreen()}
            aria-pressed={fullscreen}
            aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>

      <div
        className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2"
        style={{ borderColor: line }}
      >
        <label className="flex items-center gap-2 text-[13px]" style={{ color: secondary }}>
          Cliente
          <select
            className={fieldClass}
            value={client}
            onChange={(event) => setClient(event.target.value)}
          >
            <option value="">Todos</option>
            {clients.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px]" style={{ color: secondary }}>
          Estado
          <select
            className={fieldClass}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Todos</option>
            {hostStatuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
            style={{ color: secondary }}
          />
          <input
            className={cn(fieldClass, "w-full pl-7 placeholder:text-[rgba(204,204,220,0.45)]")}
            value={locate}
            placeholder="Buscar host, cliente ou IP"
            onChange={(event) => setLocate(event.target.value)}
          />
        </div>
      </div>

      <div className={cn("grid content-start gap-2 p-2", selected && "lg:pr-[408px]")}>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {kpis.map((item) => {
            const active = status === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatus(active ? "" : item.key)}
                aria-pressed={active}
                className={cn(
                  "flex h-[104px] flex-col items-center justify-center rounded-[2px]",
                  active && "ring-2 ring-white ring-offset-2 ring-offset-[#111217]"
                )}
                style={{ background: item.bg, color: item.fg }}
              >
                <span className="text-[36px] leading-none font-medium tabular-nums">
                  {statsReady ? item.value : "—"}
                </span>
                <span className="mt-1 text-[13px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        {!statsReady ? (
          <div
            className="flex h-36 items-center justify-center rounded-[2px] border px-4 text-center text-[13px]"
            style={{ background: panel, borderColor: line, color: error ? "#f2495c" : secondary }}
          >
            {error ||
              (!configured
                ? "Configure ZABBIX_URL e ZABBIX_TOKEN (ou usuário/senha) no .env para o painel falar com o Zabbix."
                : "Consultando o Zabbix...")}
          </div>
        ) : (
          <>
            <section
              className="overflow-hidden rounded-[2px] border"
              style={{ background: panel, borderColor: line }}
            >
              <div className="flex h-8 items-center gap-2 px-3">
                <h2 className="text-sm font-medium">Problemas</h2>
                <span className="text-[12px] tabular-nums" style={{ color: secondary }}>
                  {problemRows.length}
                </span>
              </div>
              {problemRows.length === 0 ? (
                <p
                  className="flex h-16 items-center justify-center text-[13px]"
                  style={{ color: weak }}
                >
                  Sem problemas
                </p>
              ) : (
                <div className="max-h-72 overflow-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
                    <thead className="sticky top-0" style={{ background: panel }}>
                      <tr className="border-b" style={{ borderColor: line, color: secondary }}>
                        <th className="px-3 py-1.5 text-left font-medium">Estado</th>
                        <th className="px-3 py-1.5 text-left font-medium">Cliente</th>
                        <th className="px-3 py-1.5 text-left font-medium">Host</th>
                        <th className="px-3 py-1.5 text-left font-medium">Problema</th>
                      </tr>
                    </thead>
                    <tbody>
                      {problemRows.map((row) => {
                        const color = statusColor(row.severity);
                        const active = row.host.id === selectedId;
                        return (
                          <tr
                            key={row.key}
                            tabIndex={0}
                            className={cn(
                              "cursor-pointer border-b border-l-2 hover:bg-[rgba(204,204,220,0.06)] focus-visible:bg-[rgba(110,159,255,0.14)]",
                              active && "bg-[rgba(110,159,255,0.14)]"
                            )}
                            style={{ borderColor: line, borderLeftColor: color }}
                            onClick={() => setSelectedId(row.host.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedId(row.host.id);
                              }
                            }}
                          >
                            <td className="px-3 py-1.5">
                              <span
                                className="inline-flex items-center gap-1.5 font-medium"
                                style={{ color }}
                              >
                                <span
                                  className="size-2 rounded-[1px]"
                                  style={{ background: color }}
                                />
                                {hostStatusLabel(row.severity)}
                              </span>
                            </td>
                            <td className="max-w-40 truncate px-3 py-1.5">{row.host.client}</td>
                            <td className="px-3 py-1.5 font-medium">{row.host.name}</td>
                            <td className="px-3 py-1.5" style={{ color: secondary }}>
                              {row.name}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {walls.length === 0 ? (
              <div
                className="flex h-36 items-center justify-center rounded-[2px] border px-4 text-center text-[13px]"
                style={{ background: panel, borderColor: line, color: secondary }}
              >
                {hosts.length === 0
                  ? "Nenhum host no Zabbix ainda. Cadastre um servidor no inventário."
                  : "Nenhum host para esse filtro."}
              </div>
            ) : (
              walls.map((wall) => {
                const closed = !locateQuery && collapsed.includes(wall.name);
                return (
                  <section key={wall.name} className="grid gap-2">
                    <button
                      type="button"
                      className="flex h-8 items-center gap-2 rounded-[2px] px-1 text-left hover:bg-[rgba(204,204,220,0.08)]"
                      aria-expanded={!closed}
                      onClick={() =>
                        setCollapsed((current) =>
                          current.includes(wall.name)
                            ? current.filter((item) => item !== wall.name)
                            : [...current, wall.name]
                        )
                      }
                    >
                      <ChevronDown
                        className={cn("size-4 shrink-0 transition-transform", closed && "-rotate-90")}
                        style={{ color: secondary }}
                      />
                      <span
                        className="size-2 shrink-0 rounded-[1px]"
                        style={{ background: statusColor(wall.worst) }}
                      />
                      <span className="truncate text-sm font-medium">{wall.name}</span>
                      <span
                        className="text-[12px]"
                        style={{ color: wall.problems > 0 ? statusColor(wall.worst) : secondary }}
                      >
                        {wall.problems > 0 ? `${wall.problems} com problema` : "estável"}
                      </span>
                      <span
                        className="ml-auto shrink-0 text-[12px] tabular-nums"
                        style={{ color: secondary }}
                      >
                        {wall.hosts.length === 1 ? "1 host" : `${wall.hosts.length} hosts`}
                      </span>
                    </button>
                    {closed ? null : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                        {wall.hosts.map((host) => (
                          <HostPanel
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
                    )}
                  </section>
                );
              })
            )}
          </>
        )}
      </div>

      {selected ? (
        <aside
          className={cn(
            "fixed right-0 bottom-0 z-30 flex w-full flex-col border-l shadow-[0_0_24px_rgba(0,0,0,0.45)] lg:w-[400px]",
            fullscreen ? "top-0" : "top-16"
          )}
          style={{ background: panel, borderColor: line }}
        >
          <div
            className="flex items-start justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: line }}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selected.name}</p>
              <p className="truncate text-[12px]" style={{ color: secondary }}>
                {selected.client}
                {selected.ip ? ` · ${selected.ip}` : ""}
                {selected.group ? ` · ${selected.group}` : ""}
              </p>
            </div>
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => setSelectedId(null)}
              aria-label="Fechar"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="grid gap-5 overflow-y-auto px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <span
                className="text-[13px] font-medium tracking-wide uppercase"
                style={{ color: statusColor(selected.status) }}
              >
                {hostStatusLabel(selected.status)}
              </span>
              <span className="text-[12px]" style={{ color: secondary }}>
                {formatHostTime(selected.updatedAt)}
              </span>
            </div>

            {selected.problems.length > 0 ? (
              <section className="grid gap-2">
                <h2 className="text-sm font-medium">Problemas</h2>
                {selected.problems.map((problem) => (
                  <div
                    key={problem.name}
                    className="border-l-2 py-1 pl-2.5"
                    style={{ borderColor: statusColor(problem.severity) }}
                  >
                    <p
                      className="text-[11px] font-medium tracking-wide uppercase"
                      style={{ color: statusColor(problem.severity) }}
                    >
                      {hostStatusLabel(problem.severity)}
                    </p>
                    <p className="text-[13px] leading-snug">{problem.name}</p>
                  </div>
                ))}
              </section>
            ) : null}

            {selected.metrics ? (
              <section className="grid gap-4">
                <h2 className="text-sm font-medium">Métricas</h2>
                <DetailGauge label="CPU" percent={selected.metrics.cpuPercent} />
                <DetailGauge
                  label="Memória"
                  percent={selected.metrics.memoryPercent}
                  hint={`${formatGb(selected.metrics.memoryUsedGb)} / ${formatGb(selected.metrics.memoryTotalGb)}`}
                />
                <DetailGauge
                  label={
                    selected.metrics.diskMount
                      ? `Disco (${selected.metrics.diskMount})`
                      : "Disco"
                  }
                  percent={selected.metrics.diskPercent}
                  hint={`${formatGb(selected.metrics.diskUsedGb)} / ${formatGb(selected.metrics.diskTotalGb)}`}
                />
                <div className="grid gap-1">
                  <p className="text-[13px]" style={{ color: secondary }}>
                    Rede {selected.metrics.netInterface}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[12px]" style={{ color: weak }}>
                        Entrada
                      </p>
                      <p className="text-lg leading-none font-medium tabular-nums">
                        {formatMbps(selected.metrics.netInMbps)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[12px]" style={{ color: weak }}>
                        Saída
                      </p>
                      <p className="text-lg leading-none font-medium tabular-nums">
                        {formatMbps(selected.metrics.netOutMbps)}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <p className="py-6 text-center text-[13px]" style={{ color: weak }}>
                Sem dados
              </p>
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
