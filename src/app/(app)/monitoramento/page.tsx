import type { Metadata } from "next";

import { MonitoringBoard } from "@/components/monitoramento/monitoring-board";

export const metadata: Metadata = {
  title: "Monitoramento",
};

export default function MonitoramentoPage() {
  return <MonitoringBoard />;
}
