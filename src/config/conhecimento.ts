export const kbCategories = [
  { value: "procedimento", label: "Procedimento" },
  { value: "acesso", label: "Acesso" },
  { value: "rede", label: "Rede" },
  { value: "backup", label: "Backup" },
  { value: "email", label: "E-mail" },
  { value: "outro", label: "Outro" },
] as const;

export type KbCategory = (typeof kbCategories)[number]["value"];

export function isKbCategory(value: string): value is KbCategory {
  return kbCategories.some((item) => item.value === value);
}

export function kbLabel(
  list: readonly { value: string; label: string }[],
  value: string
) {
  return list.find((item) => item.value === value)?.label ?? value;
}

export function kbCategoryBadgeClass(category: string) {
  if (category === "procedimento")
    return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (category === "acesso")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (category === "rede")
    return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
  if (category === "backup")
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (category === "email")
    return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
  return "border-border text-muted-foreground";
}

export function formatKbDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
