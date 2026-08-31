"use client";

import { Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  listArticles,
  listKnowledgeClients,
  saveArticle,
} from "@/actions/conhecimento";
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
import {
  formatKbDate,
  kbCategories,
  kbCategoryBadgeClass,
  kbLabel,
} from "@/config/conhecimento";
import { clientOptionLabel } from "@/lib/client-code";

type ArticleRow = {
  id: string;
  title: string;
  category: string;
  clientId: string | null;
  clientName: string | null;
  updatedAt: Date | string;
};

type ClientOption = { id: string; name: string; active: boolean; code?: string | null };

const emptyForm = {
  clientId: "",
  title: "",
  body: "",
  category: "procedimento",
};

function locateScore(row: ArticleRow, query: string) {
  if (!query) return 0;
  const fields = [row.title, row.clientName ?? "geral", kbLabel(kbCategories, row.category)];
  let best = 0;
  for (const field of fields) {
    const value = field.toLowerCase().trim();
    if (value === query) best = Math.max(best, 3);
    else if (value.startsWith(query)) best = Math.max(best, 2);
    else if (value.includes(query)) best = Math.max(best, 1);
  }
  return best;
}

export function KnowledgeBoard() {
  const router = useRouter();
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [category, setCategory] = useState("");
  const [locate, setLocate] = useState("");
  const [form, setForm] = useState(emptyForm);

  const locateQuery = locate.trim().toLowerCase();

  const displayed = useMemo(() => {
    if (!locateQuery) return rows;
    return [...rows].sort(
      (a, b) => locateScore(b, locateQuery) - locateScore(a, locateQuery)
    );
  }, [rows, locateQuery]);

  const locatedCount = locateQuery
    ? displayed.filter((row) => locateScore(row, locateQuery) > 0).length
    : 0;

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listArticles({
      clientId: clientId || undefined,
      category: category || undefined,
    });
    setLoading(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    setRows((result.data as ArticleRow[]) ?? []);
  }, [clientId, category]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listKnowledgeClients().then((result) => {
      if (result.serverError || !result.data) return;
      setClients(result.data);
    });
  }, []);

  function openCreate() {
    setForm(emptyForm);
    setOpen(true);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await saveArticle({
      clientId: form.clientId || undefined,
      title: form.title,
      body: form.body,
      category: form.category,
    });
    setSaving(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Artigo publicado.");
    setOpen(false);
    if (result.data?.id) {
      router.push(`/conhecimento/${result.data.id}`);
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-tight">
            Base de conhecimento
          </h1>
          <p className="text-sm text-muted-foreground">
            Procedimentos gerais ou por cliente. O técnico encontra o artigo no
            ticket.
          </p>
        </div>
        <Button className="h-9 px-3" onClick={openCreate}>
          <Plus />
          Novo
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            value={locate}
            placeholder="Localizar título, cliente ou categoria..."
            onChange={(event) => setLocate(event.target.value)}
          />
        </div>
        <NativeSelect
          className="h-9 min-w-52"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
        >
          <option value="">Todos</option>
          <option value="geral">Geral</option>
          {clients.map((item) => (
            <option key={item.id} value={item.id}>
              {clientOptionLabel(item)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-44"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">Todas as categorias</option>
          {kbCategories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {locateQuery ? (
        <p className="text-xs text-muted-foreground">
          {locatedCount === 0
            ? "Nenhum artigo localizado."
            : locatedCount === 1
              ? "1 artigo localizado na primeira linha."
              : `${locatedCount} artigos localizados no topo da lista.`}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Título</th>
              <th className="px-3 py-2.5 font-medium">Cliente</th>
              <th className="px-3 py-2.5 font-medium">Categoria</th>
              <th className="px-3 py-2.5 font-medium">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={4}>
                  Carregando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={4}>
                  Nenhum artigo ainda.
                </td>
              </tr>
            ) : (
              displayed.map((row) => {
                const located = locateScore(row, locateQuery) > 0;
                return (
                  <tr
                    key={row.id}
                    className={
                      located
                        ? "border-t bg-sky-500/15 dark:bg-sky-500/20"
                        : "border-t"
                    }
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/conhecimento/${row.id}`}
                        className="font-medium hover:underline"
                      >
                        {row.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {row.clientName ?? (
                        <span className="text-muted-foreground">Geral</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={kbCategoryBadgeClass(row.category)}
                      >
                        {kbLabel(kbCategories, row.category)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {formatKbDate(row.updatedAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo artigo</DialogTitle>
            <DialogDescription>
              Sem cliente, o artigo fica geral e aparece em qualquer ticket.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4">
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="kb-client">Cliente</FieldLabel>
                <NativeSelect
                  id="kb-client"
                  className="h-9"
                  value={form.clientId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      clientId: event.target.value,
                    }))
                  }
                >
                  <option value="">Geral</option>
                  {clients
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {clientOptionLabel(item)}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="kb-category">Categoria</FieldLabel>
                <NativeSelect
                  id="kb-category"
                  className="h-9"
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                >
                  {kbCategories.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="kb-title">Título</FieldLabel>
                <Input
                  id="kb-title"
                  className="h-9"
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="kb-body">Conteúdo</FieldLabel>
                <textarea
                  id="kb-body"
                  required
                  className="min-h-40 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={form.body}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={saving} className="h-9 px-4">
                {saving ? <Loader2 className="animate-spin" /> : null}
                Publicar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
