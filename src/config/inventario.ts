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

export const inventoryGroups = [
  {
    slug: "maquinas",
    label: "Máquinas",
    kinds: ["desktop", "notebook", "servidor", "outro"] as const,
    defaultKind: "desktop",
    title: "Máquinas",
    description:
      "Desktops, notebooks, servidores e demais equipamentos de informática.",
    empty: "Nenhuma máquina ainda.",
    createTitle: "Nova máquina",
    createHint: "O cadastro já gera o token para o agente reportar status depois.",
    createLabel: "Máquina cadastrada. O token do agente já está pronto.",
  },
  {
    slug: "impressoras",
    label: "Impressoras",
    kinds: ["impressora"] as const,
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
