import { ModuleGate } from "@/components/layout/module-gate";

export default function InventarioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleGate slug="inventario">{children}</ModuleGate>
  );
}
