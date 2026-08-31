import type { Metadata } from "next";

import { TicketBoard } from "@/components/tickets/ticket-board";

export const metadata: Metadata = {
  title: "Tickets",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <TicketBoard
      initialStatus={firstParam(params.status)}
      initialPriority={firstParam(params.priority)}
      initialUnassigned={firstParam(params.unassigned) === "1"}
      initialQueue={firstParam(params.queue)}
    />
  );
}
