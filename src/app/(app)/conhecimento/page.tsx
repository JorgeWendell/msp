import type { Metadata } from "next";

import { KnowledgeBoard } from "@/components/conhecimento/knowledge-board";

export const metadata: Metadata = {
  title: "Base de conhecimento",
};

export default function ConhecimentoPage() {
  return <KnowledgeBoard />;
}
