"use client";

import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { createTicket, listTicketOptions, listTickets } from "@/actions/tickets";
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
  formatTicketDate,
  priorityBadgeClass,
  statusBadgeClass,
  ticketCategories,
  ticketLabel,
  ticketPriorities,
  ticketStatuses,
} from "@/config/tickets";
import { clientOptionLabel } from "@/lib/client-code";

type TicketRow = {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  createdAt: Date | string;
  clientName: string;
  operatorName: string | null;
};

type Option = {
  id: string;
  name: string;
  active: boolean;
  clientId?: string;
  code?: string | null;
};

export function TicketBoard({
  initialStatus = "",
  initialPriority = "",
  initialUnassigned = false,
  initialQueue = "",
}: {
  initialStatus?: string;
  initialPriority?: string;
  initialUnassigned?: boolean;
  initialQueue?: string;
}) {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState(initialPriority);
  const [clientId, setClientId] = useState("");
  const [operatorFilter, setOperatorFilter] = useState(
    initialUnassigned ? "none" : ""
  );
  const [queue, setQueue] = useState(initialQueue);
  const [clients, setClients] = useState<Option[]>([]);
  const [contacts, setContacts] = useState<Option[]>([]);
  const [operators, setOperators] = useState<Option[]>([]);
  const [form, setForm] = useState({
    clientId: "",
    contactId: "",
    operatorId: "",
    title: "",
    description: "",
    category: "incidente",
    priority: "media",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listTickets({
      status: status || undefined,
      priority: priority || undefined,
      clientId: clientId || undefined,
      unassigned: operatorFilter === "none" || undefined,
      queue: !status && queue === "aberta" ? "aberta" : undefined,
    });
    setLoading(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    setRows((result.data as TicketRow[]) ?? []);
  }, [status, priority, clientId, operatorFilter, queue]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listTicketOptions().then((result) => {
      if (result.serverError || !result.data) return;
      setClients(result.data.clients);
      setContacts(result.data.contacts);
      setOperators(result.data.operators);
    });
  }, []);

  const formContacts = useMemo(
    () => contacts.filter((item) => item.clientId === form.clientId && item.active),
    [contacts, form.clientId]
  );

  function openCreate() {
    setForm({
      clientId: "",
      contactId: "",
      operatorId: "",
      title: "",
      description: "",
      category: "incidente",
      priority: "media",
    });
    setOpen(true);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await createTicket({
      clientId: form.clientId,
      contactId: form.contactId || undefined,
      operatorId: form.operatorId || undefined,
      title: form.title,
      description: form.description || undefined,
      category: form.category,
      priority: form.priority,
    });
    setSaving(false);
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    toast.success(`Ticket ${result.data?.number} aberto.`);
    setOpen(false);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Fila de chamados da MSP. O número é gerado automaticamente.
          </p>
        </div>
        <Button className="h-9 px-3" onClick={openCreate}>
          <Plus />
          Novo
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <NativeSelect
          className="h-9 w-44"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Todos os status</option>
          {ticketStatuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-44"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="">Todas as prioridades</option>
          {ticketPriorities.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 min-w-52"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
        >
          <option value="">Todos os clientes</option>
          {clients.map((item) => (
            <option key={item.id} value={item.id}>
              {clientOptionLabel(item)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-44"
          value={operatorFilter}
          onChange={(event) => setOperatorFilter(event.target.value)}
        >
          <option value="">Todos os operadores</option>
          <option value="none">Sem operador</option>
        </NativeSelect>
        <NativeSelect
          className="h-9 w-44"
          value={queue}
          onChange={(event) => setQueue(event.target.value)}
        >
          <option value="">Toda a fila</option>
          <option value="aberta">Em atendimento</option>
        </NativeSelect>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Número</th>
              <th className="px-3 py-2.5 font-medium">Título</th>
              <th className="px-3 py-2.5 font-medium">Cliente</th>
              <th className="px-3 py-2.5 font-medium">Operador</th>
              <th className="px-3 py-2.5 font-medium">Prioridade</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Aberto em</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>
                  Carregando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>
                  Nenhum ticket ainda.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2.5 font-medium">
                    <Link href={`/tickets/${row.id}`} className="hover:underline">
                      {row.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/tickets/${row.id}`} className="hover:underline">
                      {row.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {ticketLabel(ticketCategories, row.category)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">{row.clientName}</td>
                  <td className="px-3 py-2.5">{row.operatorName || "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={priorityBadgeClass(row.priority)}>
                      {ticketLabel(ticketPriorities, row.priority)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={statusBadgeClass(row.status)}>
                      {ticketLabel(ticketStatuses, row.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatTicketDate(row.createdAt)}
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
            <DialogTitle>Novo ticket</DialogTitle>
            <DialogDescription>
              O número no formato TKT-2026-0001 é gerado na abertura.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4">
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ticket-client">Cliente</FieldLabel>
                <NativeSelect
                  id="ticket-client"
                  className="h-9"
                  required
                  value={form.clientId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      clientId: event.target.value,
                      contactId: "",
                    }))
                  }
                >
                  <option value="">Selecione</option>
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
                <FieldLabel htmlFor="ticket-contact">Contato</FieldLabel>
                <NativeSelect
                  id="ticket-contact"
                  className="h-9"
                  value={form.contactId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      contactId: event.target.value,
                    }))
                  }
                >
                  <option value="">Nenhum</option>
                  {formContacts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="ticket-title">Título</FieldLabel>
                <Input
                  id="ticket-title"
                  className="h-9"
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ticket-category">Categoria</FieldLabel>
                <NativeSelect
                  id="ticket-category"
                  className="h-9"
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                >
                  {ticketCategories.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="ticket-priority">Prioridade</FieldLabel>
                <NativeSelect
                  id="ticket-priority"
                  className="h-9"
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                >
                  {ticketPriorities.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="ticket-operator">Operador</FieldLabel>
                <NativeSelect
                  id="ticket-operator"
                  className="h-9"
                  value={form.operatorId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      operatorId: event.target.value,
                    }))
                  }
                >
                  <option value="">Sem atribuição</option>
                  {operators
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="ticket-description">Descrição</FieldLabel>
                <textarea
                  id="ticket-description"
                  className="min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={saving} className="h-9 px-4">
                {saving ? <Loader2 className="animate-spin" /> : null}
                Abrir ticket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
