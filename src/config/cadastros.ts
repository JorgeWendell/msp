import {
  Building2,
  Headset,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export type CadastroFieldType =
  | "text"
  | "textarea"
  | "boolean"
  | "number"
  | "select"
  | "date"
  | "file"
  | "password";

export type CadastroRelation = "clientes";

export type CadastroField = {
  name: string;
  label: string;
  type: CadastroFieldType;
  required?: boolean;
  placeholder?: string;
  readonly?: boolean;
  generated?: boolean;
  options?: { value: string; label: string }[];
  relation?: CadastroRelation;
  accept?: string;
};

export type CadastroDef = {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  kind: "empresa" | "usuarios" | "crud";
  global?: boolean;
  columns: { key: string; label: string }[];
  fields: CadastroField[];
};

export const cadastros: CadastroDef[] = [
  {
    slug: "empresas",
    title: "Empresa",
    description: "Dados da MSP logada.",
    icon: Building2,
    kind: "empresa",
    columns: [],
    fields: [],
  },
  {
    slug: "usuarios",
    title: "Usuários",
    description: "Acesso ao painel e permissão por módulo.",
    icon: UserCog,
    kind: "usuarios",
    columns: [
      { key: "name", label: "Nome" },
      { key: "email", label: "E-mail" },
      { key: "role", label: "Perfil" },
    ],
    fields: [
      { name: "name", label: "Nome", type: "text", required: true },
      { name: "email", label: "E-mail", type: "text", required: true },
      { name: "password", label: "Senha", type: "password", required: true },
    ],
  },
  {
    slug: "clientes",
    title: "Clientes",
    description: "Empresas atendidas pela MSP.",
    icon: Users,
    kind: "crud",
    columns: [
      { key: "code", label: "Código" },
      { key: "name", label: "Nome" },
      { key: "tradeName", label: "Fantasia" },
      { key: "document", label: "CNPJ" },
      { key: "phone", label: "Telefone" },
      { key: "city", label: "Cidade" },
      { key: "active", label: "Ativo" },
    ],
    fields: [
      {
        name: "code",
        label: "Código do cliente",
        type: "text",
        readonly: true,
        generated: true,
        placeholder: "Gerado automaticamente (XXX-XXX)",
      },
      { name: "name", label: "Razão social", type: "text", required: true },
      { name: "tradeName", label: "Nome fantasia", type: "text" },
      { name: "document", label: "CNPJ", type: "text" },
      { name: "email", label: "E-mail", type: "text" },
      { name: "phone", label: "Telefone", type: "text" },
      { name: "zip", label: "CEP", type: "text" },
      { name: "address", label: "Endereço", type: "text" },
      { name: "city", label: "Cidade", type: "text" },
      { name: "state", label: "UF", type: "text" },
      { name: "notes", label: "Observações", type: "textarea" },
      { name: "active", label: "Ativo", type: "boolean" },
    ],
  },
  {
    slug: "contatos",
    title: "Contatos",
    description: "Pessoas de contato em cada cliente.",
    icon: UserRound,
    kind: "crud",
    columns: [
      { key: "name", label: "Nome" },
      { key: "clientName", label: "Cliente" },
      { key: "role", label: "Cargo" },
      { key: "email", label: "E-mail" },
      { key: "phone", label: "Telefone" },
      { key: "active", label: "Ativo" },
    ],
    fields: [
      {
        name: "clientId",
        label: "Cliente",
        type: "select",
        required: true,
        relation: "clientes",
      },
      { name: "name", label: "Nome", type: "text", required: true },
      { name: "role", label: "Cargo", type: "text" },
      { name: "email", label: "E-mail", type: "text" },
      { name: "phone", label: "Telefone", type: "text" },
      { name: "notes", label: "Observações", type: "textarea" },
      { name: "active", label: "Ativo", type: "boolean" },
    ],
  },
  {
    slug: "operadores",
    title: "Operadores",
    description: "Técnicos que atendem os tickets.",
    icon: Headset,
    kind: "crud",
    columns: [
      { key: "name", label: "Nome" },
      { key: "email", label: "E-mail" },
      { key: "phone", label: "Telefone" },
      { key: "specialty", label: "Especialidade" },
      { key: "active", label: "Ativo" },
    ],
    fields: [
      { name: "name", label: "Nome", type: "text", required: true },
      { name: "email", label: "E-mail", type: "text" },
      { name: "phone", label: "Telefone", type: "text" },
      {
        name: "specialty",
        label: "Especialidade",
        type: "select",
        required: true,
        options: [
          { value: "suporte", label: "Suporte" },
          { value: "redes", label: "Redes" },
          { value: "servidores", label: "Servidores" },
          { value: "cloud", label: "Cloud" },
          { value: "seguranca", label: "Segurança" },
          { value: "desenvolvimento", label: "Desenvolvimento" },
          { value: "outro", label: "Outro" },
        ],
      },
      { name: "notes", label: "Observações", type: "textarea" },
      { name: "active", label: "Ativo", type: "boolean" },
    ],
  },
];

export function getCadastro(slug: string) {
  return cadastros.find((item) => item.slug === slug);
}
