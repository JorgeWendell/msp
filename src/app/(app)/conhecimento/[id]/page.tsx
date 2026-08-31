import type { Metadata } from "next";

import { KnowledgeDetail } from "@/components/conhecimento/knowledge-detail";

export const metadata: Metadata = {
  title: "Artigo",
};

export default async function ConhecimentoArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KnowledgeDetail id={id} />;
}
