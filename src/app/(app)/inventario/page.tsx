import type { Metadata } from "next";

import { InventoryBoard } from "@/components/inventario/inventory-board";

export const metadata: Metadata = {
  title: "Inventário",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto grid max-w-6xl gap-5">
      <InventoryBoard initialAgentStatus={firstParam(params.agentStatus)} />
    </div>
  );
}
