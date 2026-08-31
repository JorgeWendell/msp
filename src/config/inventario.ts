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
