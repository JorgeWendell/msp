import {
  BookOpen,
  KeyRound,
  Monitor,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";

export type MspModule = {
  slug: string;
  code: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export const mspModules: MspModule[] = [
  {
    slug: "cadastros",
    code: "01",
    title: "Cadastros",
    description: "Empresa, usuários, clientes, contatos e operadores.",
    href: "/cadastros",
    icon: Users,
  },
  {
    slug: "tickets",
    code: "02",
    title: "Tickets",
    description: "Abertura, fila e histórico de chamados.",
    href: "/tickets",
    icon: Ticket,
  },
  {
    slug: "inventario",
    code: "03",
    title: "Inventário",
    description: "Máquinas e ativos por cliente.",
    href: "/inventario",
    icon: Monitor,
  },
  {
    slug: "cofre",
    code: "04",
    title: "Cofre",
    description: "Senhas de dispositivos, e-mails e acessos dos clientes.",
    href: "/cofre",
    icon: KeyRound,
  },
  {
    slug: "conhecimento",
    code: "05",
    title: "Base de conhecimento",
    description: "Artigos globais ou por cliente.",
    href: "/conhecimento",
    icon: BookOpen,
  },
];

export function getModuleBySlug(slug: string) {
  return mspModules.find((item) => item.slug === slug);
}

export type ModuleProfile = "administrador" | "gestor" | "usuario" | "negado";

export const moduleProfiles: { value: ModuleProfile; label: string }[] = [
  { value: "administrador", label: "Administrador" },
  { value: "gestor", label: "Gestor" },
  { value: "usuario", label: "Usuário" },
  { value: "negado", label: "Negado" },
];

export const moduleProfileRank: Record<ModuleProfile, number> = {
  negado: 0,
  usuario: 1,
  gestor: 2,
  administrador: 3,
};

export function isModuleProfile(value: string): value is ModuleProfile {
  return moduleProfiles.some((item) => item.value === value);
}

export function profileLabel(profile: string) {
  return moduleProfiles.find((item) => item.value === profile)?.label ?? profile;
}

export function defaultProfileFromRole(role: string): ModuleProfile {
  if (role === "owner") return "administrador";
  if (role === "admin") return "gestor";
  return "usuario";
}

export type AccessPreset = "todos" | "inventario";

export const accessPresets: {
  value: AccessPreset;
  label: string;
  description: string;
}[] = [
  {
    value: "todos",
    label: "Todos os módulos",
    description: "O perfil inicial vale para Cadastros, Tickets, Inventário, Cofre e Conhecimento.",
  },
  {
    value: "inventario",
    label: "Só inventário",
    description: "Vê somente o Inventário e pode cadastrar, editar e excluir máquinas.",
  },
];

export function profilesForPreset(
  preset: AccessPreset,
  fallback: ModuleProfile = "usuario"
): Record<string, ModuleProfile> {
  return Object.fromEntries(
    erpModules.map((item) => [
      item.slug,
      preset === "inventario"
        ? item.slug === "inventario"
          ? "gestor"
          : "negado"
        : fallback,
    ])
  );
}

export type ErpModule = MspModule;
export const erpModules = mspModules;
