export const hostStatuses = [
  { value: "online", label: "Online" },
  { value: "alerta", label: "Alerta" },
  { value: "critico", label: "Crítico" },
  { value: "offline", label: "Offline" },
] as const;

export type HostStatus = (typeof hostStatuses)[number]["value"];

export type HostMetrics = {
  cpuPercent: number;
  memoryPercent: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  diskPercent: number;
  diskUsedGb: number;
  diskTotalGb: number;
  diskMount: string;
  netInMbps: number;
  netOutMbps: number;
  netInterface: string;
};

export type MonitorProblem = {
  name: string;
  severity: HostStatus;
};

export type MonitorHost = {
  id: string;
  name: string;
  ip: string;
  client: string;
  group: string;
  status: HostStatus;
  metrics: HostMetrics | null;
  problems: MonitorProblem[];
  updatedAt: string;
};

export const statusRank: Record<HostStatus, number> = {
  critico: 0,
  offline: 1,
  alerta: 2,
  online: 3,
};

export function isHostStatus(value: string): value is HostStatus {
  return hostStatuses.some((item) => item.value === value);
}

export function hostStatusLabel(status: string) {
  return hostStatuses.find((item) => item.value === status)?.label ?? status;
}

export function worstStatus(hosts: MonitorHost[]): HostStatus {
  return hosts.reduce<HostStatus>((worst, host) => {
    return statusRank[host.status] < statusRank[worst] ? host.status : worst;
  }, "online");
}

export function hostStatusBadgeClass(status: string) {
  if (status === "online") {
    return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  }
  if (status === "alerta") {
    return "bg-amber-500/20 text-amber-900 dark:text-amber-200";
  }
  if (status === "critico") {
    return "bg-red-600 text-white";
  }
  if (status === "offline") {
    return "bg-zinc-500/20 text-zinc-800 dark:text-zinc-200";
  }
  return "border-border text-muted-foreground";
}

export function hostTileClass(status: HostStatus) {
  if (status === "critico") {
    return "border-red-500/70 bg-red-600 text-white shadow-sm shadow-red-600/20";
  }
  if (status === "alerta") {
    return "border-amber-400/80 bg-amber-400 text-zinc-950 shadow-sm shadow-amber-500/20";
  }
  if (status === "offline") {
    return "border-zinc-500/50 bg-zinc-600 text-white";
  }
  return "border-teal-400/80 bg-teal-300 text-teal-950 shadow-sm shadow-teal-400/20";
}

export function hostTileMutedClass(_status: HostStatus) {
  return "text-current/80";
}

export function metricBarClass(percent: number) {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export function formatGb(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
}

export function formatMbps(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} Mbps`;
}

export function formatHostTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

const problemPhrases: Array<[string | RegExp, string]> = [
  [
    /Linux: High swap space usage \(less than (\d+)% free\)/i,
    "Linux: uso alto de swap (menos de $1% livre)",
  ],
  [
    /Windows: High swap space usage \(less than (\d+)% free\)/i,
    "Windows: uso alto de swap (menos de $1% livre)",
  ],
  [
    /High swap space usage \(less than (\d+)% free\)/i,
    "Uso alto de swap (menos de $1% livre)",
  ],
  [
    /(?:Linux|Windows): High CPU utilization \(over ([\d.]+)%(?: for .+)?\)/i,
    "Uso alto de CPU (acima de $1%)",
  ],
  [
    /(?:Linux|Windows): High memory utilization \(over ([\d.]+)%(?: for .+)?\)/i,
    "Uso alto de memória (acima de $1%)",
  ],
  [
    /Disk space is low \(used > ([\d.]+)%\)/i,
    "Pouco espaço em disco (uso > $1%)",
  ],
  [
    /Interface (.+): High bandwidth usage/i,
    "Interface $1: uso alto de banda",
  ],
  [
    /Interface (.+): Link down/i,
    "Interface $1: enlace fora",
  ],
  [
    /Interface (.+): Ethernet has changed to lower speed than it was before/i,
    "Interface $1: velocidade da Ethernet caiu",
  ],
  ["Linux: High swap space usage", "Linux: uso alto de swap"],
  ["Linux: High CPU utilization", "Linux: uso alto de CPU"],
  ["Linux: High memory utilization", "Linux: uso alto de memória"],
  ["Linux: Load average is too high", "Linux: load average alto demais"],
  ["Linux: Disk space is low", "Linux: pouco espaço em disco"],
  ["Linux: Disk read/write rates are too high", "Linux: leitura/gravação de disco alta demais"],
  ["Linux: Disk I/O is overloaded", "Linux: I/O de disco sobrecarregado"],
  ["Linux: Zabbix agent is not available", "Linux: agente Zabbix indisponível"],
  ["Linux: Host has been restarted", "Linux: o host foi reiniciado"],
  ["Linux: Hostname was changed", "Linux: o hostname foi alterado"],
  ["Linux: Operating system description has changed", "Linux: a descrição do sistema operacional mudou"],
  ["Linux: System name has changed", "Linux: o nome do sistema mudou"],
  ["Linux: Version of Zabbix agent has changed", "Linux: a versão do agente Zabbix mudou"],
  ["Linux: Host information has changed", "Linux: as informações do host mudaram"],
  ["Linux: /etc/passwd has been changed", "Linux: /etc/passwd foi alterado"],
  ["Linux: Getting closer to the total number of inodes", "Linux: próximo do limite de inodes"],
  ["Windows: High CPU utilization", "Windows: uso alto de CPU"],
  ["Windows: High memory utilization", "Windows: uso alto de memória"],
  ["Windows: High swap space usage", "Windows: uso alto de swap"],
  ["Windows: Disk space is low", "Windows: pouco espaço em disco"],
  ["Windows: Zabbix agent is not available", "Windows: agente Zabbix indisponível"],
  ["Windows: Host has been restarted", "Windows: o host foi reiniciado"],
  ["Zabbix agent is not available", "Agente Zabbix indisponível"],
  ["Unavailable by ICMP ping", "Indisponível por ICMP ping"],
  ["Get value from agent failed", "Falha ao obter valor do agente"],
  ["Cannot establish TCP connection", "Não foi possível estabelecer conexão TCP"],
  ["Connection refused", "conexão recusada"],
  ["High CPU utilization", "Uso alto de CPU"],
  ["High memory utilization", "Uso alto de memória"],
  ["High swap space usage", "Uso alto de swap"],
  ["Load average is too high", "Load average alto demais"],
  ["Disk space is low", "Pouco espaço em disco"],
  ["Host has been restarted", "O host foi reiniciado"],
  ["less than ", "menos de "],
  [" is too high", " está alto demais"],
  [" has been changed", " foi alterado"],
  [" has changed", " mudou"],
  [" is not available", " está indisponível"],
];

export function translateZabbixProblem(name: string) {
  let translated = name;
  for (const [from, to] of problemPhrases) {
    translated = translated.replace(from, to);
  }
  return translated;
}
