import type { Metadata } from "next";

import { TicketDetail } from "@/components/tickets/ticket-detail";

export const metadata: Metadata = {
  title: "Ticket",
};

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TicketDetail id={id} />;
}
