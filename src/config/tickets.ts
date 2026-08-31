export const ticketStatuses = [
  { value: "aberto", label: "Aberto" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "aguardando", label: "Aguardando" },
  { value: "resolvido", label: "Resolvido" },
  { value: "fechado", label: "Fechado" },
] as const;

export const ticketPriorities = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Crítica" },
] as const;

export const ticketCategories = [
  { value: "incidente", label: "Incidente" },
  { value: "requisicao", label: "Requisição" },
  { value: "problema", label: "Problema" },
  { value: "mudanca", label: "Mudança" },
] as const;

export type TicketStatus = (typeof ticketStatuses)[number]["value"];
export type TicketPriority = (typeof ticketPriorities)[number]["value"];
export type TicketCategory = (typeof ticketCategories)[number]["value"];

export const nextTicketStatuses: Record<TicketStatus, TicketStatus[]> = {
  aberto: ["em_andamento", "aguardando"],
  em_andamento: ["aguardando", "resolvido"],
  aguardando: ["em_andamento", "resolvido"],
  resolvido: ["fechado", "em_andamento"],
  fechado: ["em_andamento"],
};

export const openTicketStatuses = [
  "aberto",
  "em_andamento",
  "aguardando",
] as const satisfies readonly TicketStatus[];

export function isTicketStatus(value: string): value is TicketStatus {
  return ticketStatuses.some((item) => item.value === value);
}

export function isTicketPriority(value: string): value is TicketPriority {
  return ticketPriorities.some((item) => item.value === value);
}

export function isTicketCategory(value: string): value is TicketCategory {
  return ticketCategories.some((item) => item.value === value);
}

export function ticketLabel(
  list: readonly { value: string; label: string }[],
  value: string
) {
  return list.find((item) => item.value === value)?.label ?? value;
}

export function canChangeStatus(from: TicketStatus, to: TicketStatus) {
  return nextTicketStatuses[from].includes(to);
}

export function statusBadgeClass(status: string) {
  if (status === "aberto") return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (status === "em_andamento")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (status === "aguardando")
    return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
  if (status === "resolvido")
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return "border-border text-muted-foreground";
}

export function priorityBadgeClass(priority: string) {
  if (priority === "critica") return "bg-destructive/10 text-destructive";
  if (priority === "alta") return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
  if (priority === "media") return "bg-secondary text-secondary-foreground";
  return "border-border text-muted-foreground";
}

export function formatTicketDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
