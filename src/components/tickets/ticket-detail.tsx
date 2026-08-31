"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  addTicketComment,
  changeTicketStatus,
  getTicket,
  listTicketOptions,
  updateTicket,
} from "@/actions/tickets";
import { TicketKnowledge } from "@/components/tickets/ticket-knowledge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import {
  formatTicketDate,
  isTicketStatus,
  nextTicketStatuses,
  priorityBadgeClass,
  statusBadgeClass,
  ticketCategories,
  ticketLabel,
  ticketPriorities,
  ticketStatuses,
  type TicketStatus,
} from "@/config/tickets";

type Option = { id: string; name: string; active: boolean; clientId?: string };

type Detail = {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  clientId: string;
  contactId: string | null;
  operatorId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  resolvedAt: Date | string | null;
  closedAt: Date | string | null;
  clientName: string;
  contactName: string | null;
  operatorName: string | null;
  createdByName: string;
  comments: {
    id: string;
    body: string;
    createdAt: Date | string;
    userName: string;
  }[];
  events: {
    id: string;
    kind: string;
    summary: string;
    createdAt: Date | string;
    userName: string | null;
  }[];
};

export function TicketDetail({ id }: { id: string }) {
  const [ticket, setTicket] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");
  const [contacts, setContacts] = useState<Option[]>([]);
  const [operators, setOperators] = useState<Option[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getTicket({ id });
    setLoading(false);
    if (result.serverError || !result.data) {
      toast.error(result.serverError || "Não foi possível carregar o ticket.");
      return;
    }
    setTicket(result.data as Detail);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listTicketOptions().then((result) => {
      if (result.serverError || !result.data) return;
      setContacts(result.data.contacts);
      setOperators(result.data.operators);
    });
  }, []);

  const clientContacts = useMemo(
    () =>
      contacts.filter(
        (item) => item.clientId === ticket?.clientId && item.active
      ),
    [contacts, ticket?.clientId]
  );

  const nextStatuses = useMemo(() => {
    if (!ticket || !isTicketStatus(ticket.status)) return [];
    return nextTicketStatuses[ticket.status];
  }, [ticket]);

  async function handleStatus(status: TicketStatus) {
    setSaving(true);
    const result = await changeTicketStatus({ id, status });
    setSaving(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Status atualizado.");
    await load();
  }

  async function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ticket) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    const result = await updateTicket({
      id,
      operatorId: String(data.get("operatorId") || "") || null,
      contactId: String(data.get("contactId") || "") || null,
      priority: String(data.get("priority") || ticket.priority),
      category: String(data.get("category") || ticket.category),
    });
    setSaving(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success("Ticket atualizado.");
    await load();
  }

  async function handleComment(event: React.FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    setSaving(true);
    const result = await addTicketComment({ id, body: comment.trim() });
    setSaving(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    setComment("");
    await load();
  }

  if (loading || !ticket) {
    return (
      <div className="overflow-hidden rounded-xl border px-3 py-8 text-center text-sm text-muted-foreground">
        {loading ? "Carregando ticket..." : "Ticket não encontrado."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Link href="/tickets" className="hover:underline">
              Tickets
            </Link>{" "}
            · {ticket.number}
          </p>
          <h1 className="font-heading text-2xl tracking-tight">{ticket.title}</h1>
          <p className="text-sm text-muted-foreground">
            Aberto por {ticket.createdByName} em {formatTicketDate(ticket.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={priorityBadgeClass(ticket.priority)}>
            {ticketLabel(ticketPriorities, ticket.priority)}
          </Badge>
          <Badge variant="outline" className={statusBadgeClass(ticket.status)}>
            {ticketLabel(ticketStatuses, ticket.status)}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((status) => (
          <Button
            key={status}
            type="button"
            variant={status === "fechado" || status === "resolvido" ? "default" : "outline"}
            className="h-8 px-3"
            disabled={saving}
            onClick={() => void handleStatus(status)}
          >
            {ticket.status === "resolvido" && status === "em_andamento"
              ? "Reabrir"
              : ticket.status === "fechado" && status === "em_andamento"
                ? "Reabrir"
                : ticketLabel(ticketStatuses, status)}
          </Button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <div className="border-b bg-muted/50 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Chamado
        </div>
        <div className="space-y-4 p-4">
          <p className="whitespace-pre-wrap text-sm leading-6">
            {ticket.description || "Sem descrição."}
          </p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Cliente</dt>
              <dd>{ticket.clientName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Contato</dt>
              <dd>{ticket.contactName || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Operador</dt>
              <dd>{ticket.operatorName || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Categoria</dt>
              <dd>{ticketLabel(ticketCategories, ticket.category)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Resolvido em</dt>
              <dd>{formatTicketDate(ticket.resolvedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fechado em</dt>
              <dd>{formatTicketDate(ticket.closedAt)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <form
        key={`${ticket.id}-${String(ticket.updatedAt)}`}
        onSubmit={handleAssign}
        className="overflow-hidden rounded-xl border"
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Atribuição
          </p>
          <Button type="submit" disabled={saving} className="h-7 px-3">
            {saving ? <Loader2 className="animate-spin" /> : null}
            Atualizar
          </Button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <FieldLabel>Operador</FieldLabel>
            <NativeSelect
              name="operatorId"
              className="h-9"
              defaultValue={ticket.operatorId ?? ""}
            >
              <option value="">Sem atribuição</option>
              {operators
                .filter((item) => item.active || item.id === ticket.operatorId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Contato</FieldLabel>
            <NativeSelect
              name="contactId"
              className="h-9"
              defaultValue={ticket.contactId ?? ""}
            >
              <option value="">Nenhum</option>
              {clientContacts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Prioridade</FieldLabel>
            <NativeSelect
              name="priority"
              className="h-9"
              defaultValue={ticket.priority}
            >
              {ticketPriorities.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Categoria</FieldLabel>
            <NativeSelect
              name="category"
              className="h-9"
              defaultValue={ticket.category}
            >
              {ticketCategories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </form>

      <TicketKnowledge ticketId={ticket.id} onChanged={() => void load()} />

      <div className="overflow-hidden rounded-xl border">
        <div className="border-b bg-muted/50 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Comentários
        </div>
        <div className="space-y-4 p-4">
          {ticket.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
          ) : (
            <div className="space-y-3">
              {ticket.comments.map((item) => (
                <div key={item.id} className="rounded-lg bg-muted/40 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{item.userName}</span>
                    <span>{formatTicketDate(item.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.body}</p>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleComment} className="grid gap-2">
            <textarea
              className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Escreva um comentário..."
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={saving || !comment.trim()} className="h-8 px-3">
                {saving ? <Loader2 className="animate-spin" /> : null}
                Comentar
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <div className="border-b bg-muted/50 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Linha do tempo
        </div>
        <div className="p-4">
          {ticket.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem eventos.</p>
          ) : (
            <ol className="space-y-3">
              {ticket.events.map((item) => (
                <li key={item.id} className="grid gap-0.5 text-sm">
                  <p>{item.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.userName || "Sistema"} · {formatTicketDate(item.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
