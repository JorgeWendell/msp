"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deleteArticle,
  getArticle,
  listKnowledgeClients,
  saveArticle,
} from "@/actions/conhecimento";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  formatKbDate,
  kbCategories,
  kbCategoryBadgeClass,
  kbLabel,
} from "@/config/conhecimento";
import { clientOptionLabel } from "@/lib/client-code";

type Detail = {
  id: string;
  title: string;
  body: string;
  category: string;
  clientId: string | null;
  clientName: string | null;
  createdByName: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ClientOption = { id: string; name: string; active: boolean; code?: string | null };

export function KnowledgeDetail({ id }: { id: string }) {
  const router = useRouter();
  const [article, setArticle] = useState<Detail | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getArticle({ id });
    setLoading(false);
    if (result.serverError || !result.data) {
      toast.error(result.serverError || "Não foi possível carregar o artigo.");
      return;
    }
    setArticle(result.data as Detail);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listKnowledgeClients().then((result) => {
      if (result.serverError || !result.data) return;
      setClients(result.data);
    });
  }, []);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!article) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    const result = await saveArticle({
      id: article.id,
      clientId: String(data.get("clientId") || "") || undefined,
      title: String(data.get("title") || ""),
      body: String(data.get("body") || ""),
      category: String(data.get("category") || article.category),
    });
    setSaving(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Artigo atualizado.");
    await load();
  }

  async function handleDelete() {
    if (!article) return;
    if (!confirm(`Excluir o artigo "${article.title}"?`)) return;
    const result = await deleteArticle({ id: article.id });
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Artigo excluído.");
    router.push("/conhecimento");
  }

  if (loading || !article) {
    return (
      <div className="overflow-hidden rounded-xl border px-3 py-8 text-center text-sm text-muted-foreground">
        {loading ? "Carregando artigo..." : "Artigo não encontrado."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Link href="/conhecimento" className="hover:underline">
              Base de conhecimento
            </Link>{" "}
            · {article.clientName ?? "Geral"}
          </p>
          <h1 className="font-heading text-2xl tracking-tight">{article.title}</h1>
          <p className="text-sm text-muted-foreground">
            Por {article.createdByName} · atualizado em {formatKbDate(article.updatedAt)}
          </p>
        </div>
        <Badge variant="outline" className={kbCategoryBadgeClass(article.category)}>
          {kbLabel(kbCategories, article.category)}
        </Badge>
      </div>

      <form
        key={`${article.id}-${String(article.updatedAt)}`}
        onSubmit={handleSave}
        className="overflow-hidden rounded-xl border"
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Artigo
          </p>
          <Button type="submit" disabled={saving} className="h-7 px-3">
            {saving ? <Loader2 className="animate-spin" /> : null}
            Salvar
          </Button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="kb-client">Cliente</FieldLabel>
            <NativeSelect
              id="kb-client"
              name="clientId"
              className="h-9"
              defaultValue={article.clientId ?? ""}
            >
              <option value="">Geral</option>
              {clients
                .filter((item) => item.active || item.id === article.clientId)
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
              name="category"
              className="h-9"
              defaultValue={article.category}
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
              name="title"
              className="h-9"
              required
              defaultValue={article.title}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="kb-body">Conteúdo</FieldLabel>
            <textarea
              id="kb-body"
              name="body"
              required
              className="min-h-64 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              defaultValue={article.body}
            />
          </Field>
        </div>
      </form>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-9 px-3 text-destructive"
          onClick={() => void handleDelete()}
        >
          Excluir artigo
        </Button>
      </div>
    </div>
  );
}
