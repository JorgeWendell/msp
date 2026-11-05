import {
  translateZabbixProblem,
  type HostMetrics,
  type HostStatus,
  type MonitorHost,
  type MonitorProblem,
} from "@/config/monitoramento";

type ZabbixSettings = {
  url: string;
  token: string;
  user: string;
  password: string;
  enabled: boolean;
  hasCredentials: boolean;
};

type JsonRpcError = {
  code: number;
  message: string;
  data?: string;
};

type ZbxItem = {
  itemid: string;
  hostid: string;
  name: string;
  key_: string;
  lastvalue: string;
  lastclock: string;
  units: string;
};

type ZbxHost = {
  hostid: string;
  host: string;
  name: string;
  status: string;
  active_available?: string;
  interfaces?: Array<{
    ip?: string;
    type?: string;
    main?: string;
    available?: string;
  }>;
  groups?: Array<{ name?: string }>;
  tags?: Array<{ tag?: string; value?: string }>;
};

type ZbxTrigger = {
  priority: string;
  description: string;
  value: string;
  hosts?: Array<{ hostid?: string }>;
};

export type ZabbixNocHost = {
  hostid: string;
  host: string;
  name: string;
  ip: string;
  groups: string[];
  tags: Record<string, string>;
  status: HostStatus;
  metrics: HostMetrics | null;
  problems: MonitorProblem[];
  updatedAt: string;
};

export type EnsureZabbixHostInput = {
  assetId: string;
  organizationId: string;
  clientId: string;
  clientName: string;
  hostname: string;
  ip?: string | null;
  os?: string | null;
  kind: string;
  zabbixHostId?: string | null;
  active: boolean;
};

const TAG_ASSET = "adelmsp.asset_id";
const TAG_CLIENT = "adelmsp.client";
const TAG_CLIENT_ID = "adelmsp.client_id";
const TAG_ORG = "adelmsp.org_id";

let sessionToken: string | null = null;
let snapshotCache: { at: number; hosts: ZabbixNocHost[] } | null = null;

export class ZabbixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZabbixError";
  }
}

export function getZabbixSettings(): ZabbixSettings {
  const url = (process.env.ZABBIX_URL ?? "").trim().replace(/\/$/, "");
  const token = (process.env.ZABBIX_TOKEN ?? "").trim();
  const user = (process.env.ZABBIX_USER ?? "").trim();
  const password = (process.env.ZABBIX_PASSWORD ?? "").trim();
  const endpoint = url
    ? url.endsWith("api_jsonrpc.php")
      ? url
      : `${url}/api_jsonrpc.php`
    : "";
  return {
    url: endpoint,
    token,
    user,
    password,
    enabled: Boolean(endpoint),
    hasCredentials: Boolean(token || (user && password)),
  };
}

async function rpc<T>(method: string, params: unknown, authToken?: string): Promise<T> {
  const settings = getZabbixSettings();
  if (!settings.url) {
    throw new ZabbixError("Zabbix ainda não está configurado (ZABBIX_URL).");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json-rpc",
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(settings.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: 1,
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    result?: T;
    error?: JsonRpcError;
  } | null;

  if (!response.ok || !payload) {
    throw new ZabbixError(`Zabbix HTTP ${response.status}.`);
  }
  if (payload.error) {
    throw new ZabbixError(payload.error.data || payload.error.message);
  }
  return payload.result as T;
}

async function authToken(): Promise<string> {
  const settings = getZabbixSettings();
  if (!settings.hasCredentials) {
    throw new ZabbixError(
      "Falta ZABBIX_TOKEN ou ZABBIX_USER/ZABBIX_PASSWORD no .env."
    );
  }
  if (settings.token) return settings.token;
  if (sessionToken) return sessionToken;

  const token = await rpc<string>("user.login", {
    username: settings.user,
    password: settings.password,
  });
  sessionToken = token;
  return token;
}

async function call<T>(method: string, params: unknown): Promise<T> {
  try {
    return await rpc<T>(method, params, await authToken());
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (sessionToken && /session|expired|not authorized|API token/i.test(message)) {
      sessionToken = null;
      return rpc<T>(method, params, await authToken());
    }
    throw error;
  }
}

function asNumber(value: string | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toGb(value: number, units: string) {
  const unit = units.toLowerCase();
  if (unit === "gb" || unit === "gib") return value;
  if (unit === "mb" || unit === "mib") return value / 1024;
  if (unit === "kb" || unit === "kib") return value / 1024 ** 2;
  if (unit === "b" || unit === "bytes" || unit === "") return value / 1024 ** 3;
  if (value > 1024 ** 3) return value / 1024 ** 3;
  return value;
}

function toMbps(value: number, units: string) {
  const unit = units.toLowerCase();
  if (unit.includes("gbps")) return value * 1000;
  if (unit.includes("mbps")) return value;
  if (unit.includes("kbps")) return value / 1000;
  if (unit.includes("bps") || unit === "b" || unit.includes("bit")) return value / 1e6;
  if (value > 10_000) return value / 1e6;
  return value;
}

function itemMount(key: string) {
  const match = key.match(/vfs\.fs(?:\.dependent)?\.size\[([^\],]+)/);
  return match?.[1] ?? "";
}

function itemIface(key: string) {
  const match = key.match(/net\.if\.(?:in|out)\[([^\],]+)/);
  return (match?.[1] ?? "").replaceAll('"', "");
}

function pickCpu(items: ZbxItem[]) {
  const cpu = items.filter(
    (item) =>
      item.key_.startsWith("system.cpu.util") &&
      !/guest|steal|interrupt|softirq|iowait|nice|user|system|idle/i.test(item.key_)
  );
  const preferred =
    cpu.find((item) => item.key_ === "system.cpu.util") ??
    cpu.find((item) => item.key_.includes("avg1")) ??
    cpu[0];
  return preferred ? asNumber(preferred.lastvalue) : null;
}

function pickMemory(items: ZbxItem[]): Pick<
  HostMetrics,
  "memoryPercent" | "memoryUsedGb" | "memoryTotalGb"
> | null {
  const percentItem =
    items.find((item) => item.key_ === "vm.memory.util") ??
    items.find((item) => item.key_.startsWith("vm.memory.util")) ??
    items.find((item) => item.key_.includes("vm.memory.size[pused]"));
  const usedItem = items.find(
    (item) =>
      item.key_ === "vm.memory.size[used]" || item.key_.includes("vm.memory.size[used]")
  );
  const totalItem = items.find(
    (item) =>
      item.key_ === "vm.memory.size[total]" ||
      item.key_.includes("vm.memory.size[total]")
  );
  const usedGb = usedItem ? toGb(Number(usedItem.lastvalue), usedItem.units) : null;
  const totalGb = totalItem
    ? toGb(Number(totalItem.lastvalue), totalItem.units)
    : null;
  const percent =
    asNumber(percentItem?.lastvalue) ??
    (usedGb != null && totalGb ? (usedGb / totalGb) * 100 : null);
  if (percent == null) return null;
  return {
    memoryPercent: percent,
    memoryUsedGb: usedGb ?? 0,
    memoryTotalGb: totalGb ?? 0,
  };
}

function pickDisk(items: ZbxItem[]): Pick<
  HostMetrics,
  "diskPercent" | "diskUsedGb" | "diskTotalGb" | "diskMount"
> | null {
  const pused = items.filter((item) =>
    /vfs\.fs(?:\.dependent)?\.size\[.+,pused\]/.test(item.key_)
  );
  if (!pused.length) return null;

  const skip = /boot|efi|recovery|tmpfs|snap|cdrom|overlay/i;
  const usable = pused.filter((item) => !skip.test(itemMount(item.key_)));
  const ranked = (usable.length ? usable : pused).sort((a, b) => {
    const mountA = itemMount(a.key_);
    const mountB = itemMount(b.key_);
    const score = (mount: string) =>
      mount === "C:" || mount === "/" ? 2 : mount.toUpperCase().startsWith("C:") ? 1 : 0;
    return score(mountB) - score(mountA) || Number(b.lastvalue) - Number(a.lastvalue);
  });
  const chosen = ranked[0];
  const mount = itemMount(chosen.key_);
  const usedItem = items.find((item) =>
    item.key_.includes(`vfs.fs`) && item.key_.includes(`[${mount},used]`)
  );
  const totalItem = items.find((item) =>
    item.key_.includes(`vfs.fs`) && item.key_.includes(`[${mount},total]`)
  );
  return {
    diskPercent: asNumber(chosen.lastvalue) ?? 0,
    diskUsedGb: usedItem ? toGb(Number(usedItem.lastvalue), usedItem.units) : 0,
    diskTotalGb: totalItem ? toGb(Number(totalItem.lastvalue), totalItem.units) : 0,
    diskMount: mount || "disco",
  };
}

function pickNet(items: ZbxItem[]): Pick<
  HostMetrics,
  "netInMbps" | "netOutMbps" | "netInterface"
> | null {
  const skip = /loopback|^lo$|^lo:|packets|errors|dropped|bytes/i;
  const inbound = items.filter(
    (item) => item.key_.startsWith("net.if.in[") && !skip.test(item.key_)
  );
  if (!inbound.length) return null;

  let best = inbound[0];
  let bestIn = 0;
  for (const item of inbound) {
    const value = asNumber(item.lastvalue) ?? 0;
    if (value >= bestIn) {
      best = item;
      bestIn = value;
    }
  }
  const iface = itemIface(best.key_);
  const outbound = items.find(
    (item) =>
      item.key_.startsWith("net.if.out[") &&
      itemIface(item.key_) === iface &&
      !skip.test(item.key_)
  );
  return {
    netInMbps: toMbps(bestIn, best.units),
    netOutMbps: outbound
      ? toMbps(asNumber(outbound.lastvalue) ?? 0, outbound.units)
      : 0,
    netInterface: iface || "rede",
  };
}

function hostMetrics(items: ZbxItem[]): HostMetrics | null {
  const cpuPercent = pickCpu(items);
  const memory = pickMemory(items);
  const disk = pickDisk(items);
  const net = pickNet(items);
  if (cpuPercent == null && !memory && !disk && !net) return null;
  return {
    cpuPercent: cpuPercent ?? 0,
    memoryPercent: memory?.memoryPercent ?? 0,
    memoryUsedGb: memory?.memoryUsedGb ?? 0,
    memoryTotalGb: memory?.memoryTotalGb ?? 0,
    diskPercent: disk?.diskPercent ?? 0,
    diskUsedGb: disk?.diskUsedGb ?? 0,
    diskTotalGb: disk?.diskTotalGb ?? 0,
    diskMount: disk?.diskMount ?? "",
    netInMbps: net?.netInMbps ?? 0,
    netOutMbps: net?.netOutMbps ?? 0,
    netInterface: net?.netInterface ?? "",
  };
}

function hostStatus(
  host: ZbxHost,
  triggers: ZbxTrigger[],
  items: ZbxItem[]
): HostStatus {
  if (host.status === "1") return "offline";
  const agent = host.interfaces?.find((item) => item.type === "1" && item.main === "1");
  if (agent?.available === "2" || host.active_available === "2") return "offline";
  const latest = items.reduce((max, item) => Math.max(max, Number(item.lastclock) || 0), 0);
  if (latest && Date.now() / 1000 - latest > 15 * 60) return "offline";

  let worst = 0;
  for (const trigger of triggers) {
    const severity = Number(trigger.priority) || 0;
    if (severity > worst) worst = severity;
  }
  if (worst >= 4) return "critico";
  if (worst >= 2) return "alerta";
  return "online";
}

function triggerSeverity(priority: string): HostStatus {
  const value = Number(priority) || 0;
  if (value >= 4) return "critico";
  if (value >= 2) return "alerta";
  return "alerta";
}

function hostProblems(triggers: ZbxTrigger[]): MonitorProblem[] {
  const seen = new Set<string>();
  const problems: MonitorProblem[] = [];
  for (const trigger of triggers) {
    const name = translateZabbixProblem(trigger.description?.trim() ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);
    problems.push({
      name,
      severity: triggerSeverity(trigger.priority),
    });
  }
  return problems;
}

function latestClock(items: ZbxItem[]) {
  const clock = items.reduce((max, item) => Math.max(max, Number(item.lastclock) || 0), 0);
  return new Date((clock || Date.now() / 1000) * 1000).toISOString();
}

function tagsOf(host: ZbxHost) {
  const tags: Record<string, string> = {};
  for (const tag of host.tags ?? []) {
    if (tag.tag) tags[tag.tag] = tag.value ?? "";
  }
  return tags;
}

export async function fetchZabbixNocHosts(force = false): Promise<ZabbixNocHost[]> {
  if (!force && snapshotCache && Date.now() - snapshotCache.at < 15_000) {
    return snapshotCache.hosts;
  }

  const hosts = await call<ZbxHost[]>("host.get", {
    output: ["hostid", "host", "name", "status", "active_available"],
    selectInterfaces: ["ip", "type", "main", "available"],
    selectHostGroups: ["name"],
    selectTags: ["tag", "value"],
  });
  const hostids = hosts.map((host) => host.hostid);
  if (!hostids.length) {
    snapshotCache = { at: Date.now(), hosts: [] };
    return [];
  }

  const itemOutput = [
    "itemid",
    "hostid",
    "name",
    "key_",
    "lastvalue",
    "lastclock",
    "units",
  ] as const;
  const [itemGroups, triggers] = await Promise.all([
    Promise.all(
      [
        "system.cpu.util",
        "vm.memory",
        "vfs.fs",
        "net.if.in",
        "net.if.out",
      ].map((key) =>
        call<ZbxItem[]>("item.get", {
          hostids,
          monitored: true,
          search: { key_: key },
          output: [...itemOutput],
        })
      )
    ),
    call<ZbxTrigger[]>("trigger.get", {
      hostids,
      monitored: true,
      expandDescription: true,
      filter: { value: "1" },
      output: ["priority", "description", "value"],
      selectHosts: ["hostid"],
      sortfield: "priority",
      sortorder: "DESC",
    }),
  ]);
  const itemsById = new Map<string, ZbxItem>();
  for (const group of itemGroups) {
    for (const item of group) itemsById.set(item.itemid, item);
  }
  const items = Array.from(itemsById.values());

  const itemsByHost = new Map<string, ZbxItem[]>();
  for (const item of items) {
    const list = itemsByHost.get(item.hostid) ?? [];
    list.push(item);
    itemsByHost.set(item.hostid, list);
  }
  const triggersByHost = new Map<string, ZbxTrigger[]>();
  for (const trigger of triggers) {
    for (const host of trigger.hosts ?? []) {
      if (!host.hostid) continue;
      const list = triggersByHost.get(host.hostid) ?? [];
      list.push(trigger);
      triggersByHost.set(host.hostid, list);
    }
  }

  const mapped = hosts.map((host) => {
    const hostItems = itemsByHost.get(host.hostid) ?? [];
    const hostTriggers = triggersByHost.get(host.hostid) ?? [];
    const agent = host.interfaces?.find((item) => item.main === "1") ?? host.interfaces?.[0];
    return {
      hostid: host.hostid,
      host: host.host,
      name: host.name || host.host,
      ip: agent?.ip || "",
      groups: (host.groups ?? []).map((group) => group.name ?? "").filter(Boolean),
      tags: tagsOf(host),
      status: hostStatus(host, hostTriggers, hostItems),
      metrics: hostMetrics(hostItems),
      problems: hostProblems(hostTriggers),
      updatedAt: latestClock(hostItems),
    } satisfies ZabbixNocHost;
  });

  snapshotCache = { at: Date.now(), hosts: mapped };
  return mapped;
}

function technicalName(assetId: string) {
  return `adelmsp_${assetId.replaceAll("-", "")}`;
}

function groupName(clientName: string) {
  return `AdelMSP/${clientName.replaceAll("/", "-")}`;
}

async function ensureGroup(name: string) {
  const found = await call<Array<{ groupid: string }>>("hostgroup.get", {
    filter: { name: [name] },
    output: ["groupid"],
  });
  if (found[0]) return found[0].groupid;
  const created = await call<{ groupids: string[] }>("hostgroup.create", { name });
  return created.groupids[0];
}

async function findTemplateId(os: string | null | undefined) {
  const windows = /win/i.test(os ?? "");
  const wanted = windows
    ? ["Windows by Zabbix agent active", "Windows by Zabbix agent"]
    : ["Linux by Zabbix agent active", "Linux by Zabbix agent"];
  const found = await call<Array<{ templateid: string; name: string }>>("template.get", {
    output: ["templateid", "name"],
    searchByAny: true,
    search: { name: wanted },
  });
  for (const name of wanted) {
    const match = found.find((item) => item.name === name);
    if (match) return match.templateid;
  }
  return found[0]?.templateid ?? null;
}

function hostTags(input: EnsureZabbixHostInput) {
  return [
    { tag: TAG_ASSET, value: input.assetId },
    { tag: TAG_CLIENT_ID, value: input.clientId },
    { tag: TAG_CLIENT, value: input.clientName },
    { tag: TAG_ORG, value: input.organizationId },
  ];
}

export async function ensureZabbixHost(input: EnsureZabbixHostInput) {
  const settings = getZabbixSettings();
  if (!settings.enabled) {
    return { hostid: null as string | null, warning: "Zabbix ainda não está configurado." };
  }
  if (!settings.hasCredentials) {
    return {
      hostid: null as string | null,
      warning: "Falta token ou senha do Zabbix no .env.",
    };
  }
  if (!input.active) {
    if (input.zabbixHostId) {
      await call("host.update", { hostid: input.zabbixHostId, status: 1 });
      snapshotCache = null;
    }
    return { hostid: input.zabbixHostId ?? null, warning: undefined as string | undefined };
  }

  const tags = hostTags(input);
  const groupid = await ensureGroup(groupName(input.clientName));

  if (input.zabbixHostId) {
    const current = await call<ZbxHost[]>("host.get", {
      hostids: [input.zabbixHostId],
      output: ["hostid"],
      selectTags: ["tag", "value"],
    });
    if (current[0]) {
      const kept = (current[0].tags ?? []).filter((tag) => !tag.tag?.startsWith("adelmsp."));
      await call("host.update", {
        hostid: input.zabbixHostId,
        name: input.hostname,
        status: 0,
        tags: [...kept, ...tags],
      });
      snapshotCache = null;
      return { hostid: input.zabbixHostId, warning: undefined as string | undefined };
    }
  }

  const existing = await call<ZbxHost[]>("host.get", {
    filter: { host: [input.hostname, technicalName(input.assetId)] },
    output: ["hostid", "host", "name"],
    selectTags: ["tag", "value"],
  });
  const byName = existing.length
    ? []
    : await call<ZbxHost[]>("host.get", {
        filter: { name: [input.hostname] },
        output: ["hostid", "host", "name"],
        selectTags: ["tag", "value"],
      });
  const match =
    existing.find((host) => host.host === technicalName(input.assetId)) ??
    existing.find((host) => host.host === input.hostname) ??
    byName.find((host) => host.name === input.hostname);

  if (match) {
    const kept = (match.tags ?? []).filter((tag) => !tag.tag?.startsWith("adelmsp."));
    await call("host.update", {
      hostid: match.hostid,
      status: 0,
      tags: [...kept, ...tags],
    });
    snapshotCache = null;
    return { hostid: match.hostid, warning: undefined as string | undefined };
  }

  if (!input.ip) {
    return {
      hostid: null as string | null,
      warning: "Informe o IP do servidor para criar o host no Zabbix.",
    };
  }

  const templateid = await findTemplateId(input.os);
  const created = await call<{ hostids: string[] }>("host.create", {
    host: technicalName(input.assetId),
    name: input.hostname,
    status: 0,
    groups: [{ groupid }],
    tags,
    interfaces: [
      {
        type: 1,
        main: 1,
        useip: 1,
        ip: input.ip,
        dns: "",
        port: "10050",
      },
    ],
    ...(templateid ? { templates: [{ templateid }] } : {}),
  });
  snapshotCache = null;
  return {
    hostid: created.hostids[0] ?? null,
    warning: templateid
      ? undefined
      : "Host criado no Zabbix sem template. Vincule o template do SO na UI do Zabbix.",
  };
}

export async function disableZabbixHost(hostid: string) {
  const settings = getZabbixSettings();
  if (!settings.enabled || !settings.hasCredentials) return;
  await call("host.update", { hostid, status: 1 });
  snapshotCache = null;
}

export function zabbixHostToMonitor(
  host: ZabbixNocHost,
  client: string,
  id?: string
): MonitorHost {
  const group =
    host.groups.find((name) => name.startsWith("AdelMSP/"))?.replace("AdelMSP/", "") ||
    host.groups[0] ||
    "Zabbix";
  return {
    id: id ?? `zbx-${host.hostid}`,
    name: host.name,
    ip: host.ip,
    client,
    group,
    status: host.status,
    metrics: host.metrics,
    problems: host.problems,
    updatedAt: host.updatedAt,
  };
}
