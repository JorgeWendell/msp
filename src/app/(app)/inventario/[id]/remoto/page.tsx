import type { Metadata } from "next";

import { RemoteDesktop } from "@/components/inventario/remote-desktop";

export const metadata: Metadata = {
  title: "Área de Trabalho",
};

export default async function InventarioRemotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="relative -m-4 h-[calc(100svh-4rem)] min-h-0 overflow-hidden sm:-m-6">
      <RemoteDesktop id={id} />
    </div>
  );
}
