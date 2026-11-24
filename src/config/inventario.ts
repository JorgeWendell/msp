export const assetKinds = [
  { value: "desktop", label: "Desktop" },
  { value: "notebook", label: "Notebook" },
  { value: "servidor", label: "Servidor" },
  { value: "impressora", label: "Impressora" },
  { value: "rede", label: "Rede" },
  { value: "outro", label: "Outro" },
] as const;

export const agentStatuses = [
  { value: "desconhecido", label: "Sem agente" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
] as const;

export type AssetKind = (typeof assetKinds)[number]["value"];
export type AgentStatus = (typeof agentStatuses)[number]["value"];

export function isAssetKind(value: string): value is AssetKind {
  return assetKinds.some((item) => item.value === value);
}

export function isAgentStatus(value: string): value is AgentStatus {
  return agentStatuses.some((item) => item.value === value);
}

export function assetLabel(
  list: readonly { value: string; label: string }[],
  value: string
) {
  return list.find((item) => item.value === value)?.label ?? value;
}

export function agentStatusBadgeClass(status: string) {
  if (status === "online")
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "offline") return "bg-destructive/10 text-destructive";
  return "border-border text-muted-foreground";
}

export function formatAssetDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function createAgentToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

export function monitorsInZabbix(kind: string) {
  return kind === "servidor" || kind === "rede";
}

export type InventoryOsMatch = "any" | "windows-server" | "not-windows-server";

export function isWindowsServerOs(os: string | null | undefined) {
  return /windows\s*server/i.test(os ?? "");
}

export function matchesInventoryOs(os: string | null | undefined, match: InventoryOsMatch) {
  if (match === "windows-server") return isWindowsServerOs(os);
  if (match === "not-windows-server") return !isWindowsServerOs(os);
  return true;
}

export const inventoryGroups = [
  {
    slug: "maquinas",
    label: "Máquinas",
    kinds: ["desktop", "notebook", "servidor", "outro"] as const,
    osMatch: "not-windows-server" as const,
    defaultKind: "desktop",
    title: "Máquinas",
    description:
      "Desktops, notebooks e demais equipamentos de informática, sem Windows Server.",
    empty: "Nenhuma máquina ainda.",
    createTitle: "Nova máquina",
    createHint: "O cadastro já gera o token para o agente reportar status depois.",
    createLabel: "Máquina cadastrada. O token do agente já está pronto.",
  },
  {
    slug: "servidores",
    label: "Servidores",
    kinds: ["desktop", "notebook", "servidor", "outro"] as const,
    osMatch: "windows-server" as const,
    defaultKind: "servidor",
    title: "Servidores",
    description: "Equipamentos com Microsoft Windows Server.",
    empty: "Nenhum servidor Windows ainda.",
    createTitle: "Novo servidor",
    createHint: "Use o sistema operacional Windows Server para aparecer neste grupo.",
    createLabel: "Servidor cadastrado. O token do agente já está pronto.",
  },
  {
    slug: "impressoras",
    label: "Impressoras",
    kinds: ["impressora"] as const,
    osMatch: "any" as const,
    defaultKind: "impressora",
    title: "Impressoras",
    description: "Impressoras cadastradas por cliente.",
    empty: "Nenhuma impressora ainda.",
    createTitle: "Nova impressora",
    createHint: "O cadastro fica no mesmo inventário, só filtrado por tipo.",
    createLabel: "Impressora cadastrada.",
  },
  {
    slug: "rede",
    label: "Firewall & Routers",
    kinds: ["rede"] as const,
    osMatch: "any" as const,
    defaultKind: "rede",
    title: "Firewall & Routers",
    description: "Firewalls, roteadores e demais ativos de rede.",
    empty: "Nenhum firewall ou roteador ainda.",
    createTitle: "Novo ativo de rede",
    createHint: "Use o tipo Rede. Os registros atuais de rede continuam aqui.",
    createLabel: "Ativo de rede cadastrado.",
  },
] as const;

export type InventoryGroupSlug = (typeof inventoryGroups)[number]["slug"];

/** Lista de Máquinas no estilo painel. false = tabela antiga. */
export const SHOW_MACHINES_PANEL_LIST = true;

const ignoredWindowsUsers = new Set([
  "system",
  "local service",
  "network service",
  "anonymous logon",
  "defaultaccount",
  "wdagutilityaccount",
  "guest",
  "convidado",
  "administrador",
  "administrator",
  "defaultuser0",
  "public",
  "default",
  "adelmsp",
]);

function rawText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const parts = value
      .map((item) =>
        typeof item === "string"
          ? item.trim()
          : item && typeof item === "object" && "name" in item
            ? String((item as { name?: unknown }).name ?? "").trim()
            : ""
      )
      .filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

export function displayWindowsUser(value: unknown) {
  const raw = rawText(value);
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim() ?? "";
  const withoutDomain = first.includes("\\")
    ? first.slice(first.lastIndexOf("\\") + 1)
    : first.includes("@")
      ? first.slice(0, first.indexOf("@"))
      : first;
  const name = withoutDomain.trim();
  if (!name) return null;
  const lower = name.toLowerCase();
  if (ignoredWindowsUsers.has(lower)) return null;
  if (lower.startsWith("dwm-") || lower.startsWith("umfd-")) return null;
  if (name.endsWith("$")) return null;
  return name;
}

function realUsersFromList(users: unknown) {
  if (!Array.isArray(users)) return [];
  const names = users
    .map((item) => displayWindowsUser(item))
    .filter((item): item is string => Boolean(item));
  return [...new Set(names)];
}

export function inventoryListFields(payload: unknown) {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  const system =
    root?.system && typeof root.system === "object"
      ? (root.system as Record<string, unknown>)
      : null;
  const hostname = (rawText(system?.hostname ?? system?.Hostname) ?? "").toLowerCase();
  const notHost = (name: string | null) =>
    name && name.toLowerCase() !== hostname ? name : null;
  const logged = notHost(
    displayWindowsUser(system?.loggedUser) ??
      displayWindowsUser(system?.LoggedUser) ??
      displayWindowsUser(system?.userName)
  );
  const fromUsers = realUsersFromList(root?.users).filter(
    (name) => name.toLowerCase() !== hostname
  );
  const sessionRaw = Array.isArray(root?.users)
    ? (root.users as unknown[]).find((item) => {
        const raw = rawText(item);
        return Boolean(raw?.includes("\\") && displayWindowsUser(raw));
      })
    : null;
  return {
    loggedUser:
      logged ??
      notHost(displayWindowsUser(sessionRaw)) ??
      (fromUsers.length === 1 ? fromUsers[0] : fromUsers[0] ?? null),
    antivirus: rawText(system?.antivirus ?? system?.Antivirus),
    reportedOs: rawText(system?.os ?? system?.Os),
  };
}

export function getInventoryGroup(slug: string | null | undefined) {
  return (
    inventoryGroups.find((item) => item.slug === slug) ?? inventoryGroups[0]
  );
}

export function inventoryGroupHref(slug: string) {
  return `/inventario?grupo=${slug}`;
}

export function inventoryGroupForKind(kind: string) {
  return (
    inventoryGroups.find((item) =>
      (item.kinds as readonly string[]).includes(kind)
    ) ?? inventoryGroups[0]
  );
}

export function inventoryGroupForAsset(kind: string, os?: string | null) {
  if (kind === "impressora" || kind === "rede") {
    return inventoryGroupForKind(kind);
  }
  return getInventoryGroup(isWindowsServerOs(os) ? "servidores" : "maquinas");
}

const TONER_NOTE_PREFIX = "Toner/Tinta:";

export function parsePrinterNotes(notes: string | null | undefined) {
  const text = notes ?? "";
  if (!text.startsWith(TONER_NOTE_PREFIX)) {
    return { toner: "", notes: text };
  }
  const rest = text.slice(TONER_NOTE_PREFIX.length);
  const breakAt = rest.indexOf("\n");
  if (breakAt === -1) {
    return { toner: rest.trim(), notes: "" };
  }
  return {
    toner: rest.slice(0, breakAt).trim(),
    notes: rest.slice(breakAt + 1),
  };
}

export function composePrinterNotes(toner: string, notes: string) {
  const code = toner.trim();
  const body = notes.trim();
  if (!code) return body;
  return body ? `${TONER_NOTE_PREFIX} ${code}\n${body}` : `${TONER_NOTE_PREFIX} ${code}`;
}

export const networkHostnames = [
  { value: "Pfsense", label: "Pfsense" },
  { value: "Mikrotik", label: "Mikrotik" },
  { value: "Outros", label: "Outros" },
] as const;

export function networkHostnameOptions(current?: string | null) {
  const value = current?.trim() ?? "";
  if (
    value &&
    !networkHostnames.some(
      (item) => item.value.toLowerCase() === value.toLowerCase()
    )
  ) {
    return [{ value, label: value }, ...networkHostnames];
  }
  return [...networkHostnames];
}
