import type { Metadata } from "next";

import { InventoryDetail } from "@/components/inventario/inventory-detail";

export const metadata: Metadata = {
  title: "Máquina",
};

export default async function InventarioAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto grid max-w-6xl gap-5">
      <InventoryDetail id={id} />
    </div>
  );
}
