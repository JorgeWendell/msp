"use client";

import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  attachTicketArticle,
  detachTicketArticle,
  listTicketKnowledge,
} from "@/actions/tickets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  kbCategories,
  kbCategoryBadgeClass,
  kbLabel,
} from "@/config/conhecimento";

type Article = {
  id: string;
  title: string;
  body: string;
  category: string;
  clientId: string | null;
  clientName: string | null;
  linked: boolean;
  general: boolean;
};

export function TicketKnowledge({
  ticketId,
  onChanged,
}: {
  ticketId: string;
  onChanged?: () => void;
}) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listTicketKnowledge({ ticketId });
    setLoading(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    setArticles((result.data as Article[]) ?? []);
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const linked = useMemo(() => articles.filter((item) => item.linked), [articles]);
  const suggested = useMemo(
    () => articles.filter((item) => !item.linked),
    [articles]
  );

  async function attach(articleId: string) {
    setBusyId(articleId);
    const result = await attachTicketArticle({ ticketId, articleId });
    setBusyId(null);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Artigo vinculado ao ticket.");
    setOpenId(articleId);
    await load();
    onChanged?.();
  }

  async function detach(articleId: string) {
    setBusyId(articleId);
    const result = await detachTicketArticle({ ticketId, articleId });
    setBusyId(null);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Artigo desvinculado.");
    await load();
    onChanged?.();
  }

  function renderItem(item: Article, action: "attach" | "detach") {
    const open = openId === item.id;
    return (
      <div key={item.id} className="rounded-lg border bg-muted/20">
        <div className="flex items-start gap-2 px-3 py-2.5">
          <button
            type="button"
            className="mt-0.5 text-muted-foreground"
            onClick={() => setOpenId(open ? null : item.id)}
            aria-label={open ? "Recolher artigo" : "Abrir artigo"}
          >
            {open ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{item.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={kbCategoryBadgeClass(item.category)}
              >
                {kbLabel(kbCategories, item.category)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {item.general ? "Geral" : item.clientName}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-7 shrink-0 px-2.5"
            disabled={busyId === item.id}
            onClick={() =>
              void (action === "attach" ? attach(item.id) : detach(item.id))
            }
          >
            {busyId === item.id ? <Loader2 className="animate-spin" /> : null}
            {action === "attach" ? "Vincular" : "Remover"}
          </Button>
        </div>
        {open ? (
          <div className="space-y-2 border-t px-3 py-3">
            <p className="whitespace-pre-wrap text-sm leading-6">{item.body}</p>
            <Link
              href={`/conhecimento/${item.id}`}
              className="text-xs text-muted-foreground hover:underline"
            >
              Abrir na base
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="border-b bg-muted/50 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Procedimentos
      </div>
      <div className="space-y-4 p-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando artigos...</p>
        ) : articles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum artigo geral ou deste cliente ainda. Cadastre na base de
            conhecimento.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Vinculados a este ticket
              </p>
              {linked.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum procedimento vinculado.
                </p>
              ) : (
                linked.map((item) => renderItem(item, "detach"))
              )}
            </div>
            {suggested.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Do cliente e gerais
                </p>
                {suggested.map((item) => renderItem(item, "attach"))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
