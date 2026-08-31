export const vaultKinds = [
  { value: "dispositivo", label: "Dispositivo" },
  { value: "email", label: "E-mail" },
  { value: "acesso", label: "Acesso" },
  { value: "outro", label: "Outro" },
] as const;

export type VaultKind = (typeof vaultKinds)[number]["value"];

export function isVaultKind(value: string): value is VaultKind {
  return vaultKinds.some((item) => item.value === value);
}

export function vaultLabel(
  list: readonly { value: string; label: string }[],
  value: string
) {
  return list.find((item) => item.value === value)?.label ?? value;
}

export function vaultKindBadgeClass(kind: string) {
  if (kind === "dispositivo")
    return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (kind === "email")
    return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
  if (kind === "acesso")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "border-border text-muted-foreground";
}
