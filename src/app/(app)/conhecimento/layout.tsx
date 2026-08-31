import { ModuleGate } from "@/components/layout/module-gate";

export default function ConhecimentoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleGate slug="conhecimento">
      <div className="mx-auto grid max-w-6xl gap-5">{children}</div>
    </ModuleGate>
  );
}
