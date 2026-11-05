import { ModuleGate } from "@/components/layout/module-gate";

export default function MonitoramentoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleGate slug="monitoramento">
      <div className="grid w-full gap-5">{children}</div>
    </ModuleGate>
  );
}
