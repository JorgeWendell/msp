"use client";

import { Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deleteCadastro,
  listCadastro,
  listRelationOptions,
  saveCadastro,
} from "@/actions/cadastros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { CadastroDef } from "@/config/cadastros";
import { getCadastro } from "@/config/cadastros";

type Row = Record<string, unknown> & { id: string };

function emptyValues(def: CadastroDef) {
  const values: Record<string, unknown> = {};
  for (const field of def.fields) {
    if (field.type === "boolean") values[field.name] = true;
    else if (field.type === "number") values[field.name] = 0;
    else values[field.name] = "";
  }
  return values;
}

function formatCell(def: CadastroDef, key: string, value: unknown) {
  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const field = def.fields.find((item) => item.name === key);
  const option = field?.options?.find((item) => item.value === String(value));
  return option?.label ?? String(value);
}

export function CadastroCrud({ slug }: { slug: string }) {
  const def = getCadastro(slug);

  if (!def) {
    return (
      <p className="text-sm text-muted-foreground">Cadastro não encontrado.</p>
    );
  }

  return <CadastroCrudForm def={def} />;
}

function CadastroCrudForm({ def }: { def: CadastroDef }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [values, setValues] = useState<Record<string, unknown>>(emptyValues(def));
  const [relations, setRelations] = useState<
    Record<string, { id: string; label: string }[]>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listCadastro({ slug: def.slug });
    setLoading(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    setRows((result.data as Row[]) ?? []);
  }, [def.slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const relationNames = def.fields
      .map((field) => field.relation)
      .filter(Boolean) as string[];

    if (!relationNames.length) return;

    void Promise.all(
      relationNames.map(async (relation) => {
        const result = await listRelationOptions({ relation });
        return [relation, result.data ?? []] as const;
      })
    ).then((entries) => {
      setRelations(Object.fromEntries(entries));
    });
  }, [def.fields]);

  function openCreate() {
    setEditingId(undefined);
    setValues(emptyValues(def));
    setOpen(true);
  }

  function openEdit(row: Row) {
    const next = emptyValues(def);
    for (const field of def.fields) {
      next[field.name] = row[field.name] ?? next[field.name];
    }
    setEditingId(row.id);
    setValues(next);
    setOpen(true);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await saveCadastro({
      slug: def.slug,
      id: editingId,
      data: values,
    });
    setSaving(false);

    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }

    toast.success(
      editingId
        ? "Registro atualizado."
        : result.data?.code
          ? `Cliente criado. Código ${result.data.code}`
          : "Registro criado."
    );
    setOpen(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este registro?")) return;
    const result = await deleteCadastro({ slug: def.slug, id });
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Registro excluído.");
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-tight">{def.title}</h1>
          <p className="text-sm text-muted-foreground">{def.description}</p>
        </div>
        <Button className="h-9 px-3" onClick={openCreate}>
          <Plus />
          Novo
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              {def.columns.map((column) => (
                <th key={column.key} className="px-3 py-2.5 font-medium">
                  {column.label}
                </th>
              ))}
              <th className="w-24 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-muted-foreground"
                  colSpan={def.columns.length + 1}
                >
                  Carregando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-muted-foreground"
                  colSpan={def.columns.length + 1}
                >
                  Nenhum registro ainda.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  {def.columns.map((column) => (
                    <td key={column.key} className="px-3 py-2.5">
                      {column.key === "active" ? (
                        <Badge variant={row.active ? "secondary" : "outline"}>
                          {row.active ? "Ativo" : "Inativo"}
                        </Badge>
                      ) : column.key === "code" && row.code ? (
                        <div className="flex items-center gap-1">
                          <code className="font-mono text-xs">{String(row.code)}</code>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(String(row.code));
                              toast.success("Código copiado.");
                            }}
                          >
                            <Copy />
                          </Button>
                        </div>
                      ) : (
                        formatCell(def, column.key, row[column.key])
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(row)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(row.id)}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? `Editar ${def.title}` : `Novo · ${def.title}`}
            </DialogTitle>
            <DialogDescription>{def.description}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="grid gap-4">
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              {def.fields.map((field) => (
                <Field
                  key={field.name}
                  className={
                    field.type === "textarea" ? "sm:col-span-2" : undefined
                  }
                >
                  <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
                  {field.generated || field.readonly ? (
                    <Input
                      id={field.name}
                      className="h-9 font-mono"
                      readOnly
                      value={
                        String(values[field.name] ?? "") ||
                        (field.generated ? "Gerado ao salvar (XXX-XXX)" : "")
                      }
                    />
                  ) : field.type === "textarea" ? (
                    <textarea
                      id={field.name}
                      className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={String(values[field.name] ?? "")}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }))
                      }
                    />
                  ) : field.type === "boolean" ? (
                    <label className="flex h-8 items-center gap-2 text-sm">
                      <input
                        id={field.name}
                        type="checkbox"
                        checked={Boolean(values[field.name])}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: event.target.checked,
                          }))
                        }
                      />
                      {field.label}
                    </label>
                  ) : field.type === "select" ? (
                    <NativeSelect
                      id={field.name}
                      required={field.required}
                      value={String(values[field.name] ?? "")}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione</option>
                      {field.options
                        ? field.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))
                        : (relations[field.relation ?? ""] ?? []).map(
                            (option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            )
                          )}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={field.name}
                      type={
                        field.type === "number"
                          ? "number"
                          : field.type === "date"
                            ? "date"
                            : "text"
                      }
                      className="h-9"
                      required={field.required}
                      value={String(values[field.name] ?? "")}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.name]:
                            field.type === "number"
                              ? event.target.valueAsNumber
                              : event.target.value,
                        }))
                      }
                    />
                  )}
                </Field>
              ))}
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={saving} className="h-9 px-4">
                {saving ? <Loader2 className="animate-spin" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
