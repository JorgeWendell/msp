import { ModuleGate } from "@/components/layout/module-gate";

export default function CofreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleGate slug="cofre">
      <div className="mx-auto grid max-w-6xl gap-5">{children}</div>
    </ModuleGate>
  );
}
